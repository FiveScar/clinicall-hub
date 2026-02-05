// src/orchestrator/rpcEngine.js
import clinicall from "../clinicall/client.js";
import * as contract from "./contract.js";

function onlyDigits(v) {
  return String(v ?? "").replace(/\D+/g, "");
}
function toId(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function isDateYYYYMMDD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function toDateYYYYMMDDLoose(v) {
  // aceita "YYYY-MM-DD" ou "YYYY-MM-DDTHH:mm" e devolve apenas a data
  if (v == null) return "";
  const s = String(v).trim();
  if (!s) return "";
  return s.includes("T") ? s.split("T")[0] : s;
}

function buildSearchPayload(input = {}) {
  return {
    argument: input.argument ?? "",
    page: Number.isFinite(input.page) ? input.page : 0,
    sizePage: Number.isFinite(input.sizePage) ? input.sizePage : 25,
    fieldSort: input.fieldSort ?? "name",
    sortDirection: input.sortDirection ?? "asc",
  };
}

/**
 * CREATE patient — IDs planos (já validado por você)
 */
function buildPatientCreatePayload(input = {}) {
  const payload = {};
  payload.name = String(input.name ?? "").trim();
  payload.cpf = onlyDigits(input.cpf);
  const birthday = input.birthday ?? input.birthDate ?? input.birthdate;
  if (birthday != null) payload.birthday = String(birthday).trim();

  const phone = onlyDigits(input.phoneStandart ?? input.phone);
  if (phone) payload.phoneStandart = phone;

  const genderId = toId(input.genderId);
  if (genderId) payload.genderId = genderId;

  const civilStatusId = toId(input.civilStatusId);
  if (civilStatusId) payload.civilStatusId = civilStatusId;

  const insuranceId = toId(input.insuranceId);
  if (insuranceId) payload.insuranceId = insuranceId;

  const companyId = toId(input.companyId);
  if (companyId) payload.companyId = companyId;

  if (input.active !== undefined) payload.active = Boolean(input.active);
  if (input.mother !== undefined) payload.mother = input.mother;
  if (input.email !== undefined) payload.email = input.email;
  if (input.identity !== undefined) payload.identity = input.identity;

  if (input.address) {
    const a = input.address;
    const addressTypeId = toId(a.addressTypeId);
    const cityId = toId(a.cityId);
    const countryId = toId(a.countryId) ?? 1;

    if (!addressTypeId)
      throw new Error(
        "patient.create: address.addressTypeId é obrigatório quando address é informado"
      );
    if (!cityId)
      throw new Error(
        "patient.create: address.cityId é obrigatório quando address é informado"
      );

    payload.address = {
      address: a.address ?? "",
      district: a.district ?? "",
      zipcode: onlyDigits(a.zipcode),
      description: a.description ?? null,
      addon: a.addon ?? null,
      number: a.number != null ? String(a.number) : null,
      addressTypeId,
      cityId,
      countryId,
    };
  }

  return payload;
}

/**
 * UPDATE patient — mesmo payload do create + id
 */
function buildPatientUpdatePayload(input = {}) {
  const id = toId(input.id ?? input.patientId);
  if (!id) throw new Error("patient.update: id inválido");
  return { id, ...buildPatientCreatePayload(input) };
}

async function GET(path) {
  return clinicall.request(path, { method: "GET" });
}
async function POST(path, body) {
  return clinicall.request(path, { method: "POST", body });
}
async function PUT(path, body) {
  return clinicall.request(path, { method: "PUT", body });
}
async function DEL(path) {
  return clinicall.request(path, { method: "DELETE" });
}

export async function runRPC(op, data = {}) {
  op = String(op || "").trim();

  try {
    // COMPANIES
    if (op === "companies.list") {
      const r = await GET("/partners/company");
      return contract.ok({ data: r, nextAction: "companies_list" });
    }

    // STATUS simpleList
    if (op === "status.simpleList") {
      const type = String(data?.type || "").trim();
      if (!type)
        return contract.error(
          "status.simpleList: type é obrigatório (patientStatus|scheduleStatus)"
        );
      const r = await GET(`/partners/status/${type}/simpleList`);
      return contract.ok({ data: r, nextAction: "status_list" });
    }

    // PATIENT SEARCH (sem telefone)
    if (op === "patient.search") {
      const argument = String(data?.argument ?? "").trim();
      if (!argument) {
        return contract.fallback({
          message:
            "Perfeito. Me informe seu nome completo e CPF para eu localizar seu cadastro.",
          nextAction: "ask_name_cpf",
        });
      }

      const r = await POST(
        "/partners/patient/search",
        buildSearchPayload({ ...data, argument })
      );

      const list = Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : [];

      if (list.length === 0) {
        return contract.ok({
          message:
            "Certo. Não encontrei cadastro com esses dados. Posso fazer seu cadastro agora.",
          data: [],
          nextAction: "patient_not_found",
        });
      }

      if (list.length > 1) {
        return contract.ok({
          message:
            "Entendi. Encontrei mais de um cadastro parecido. Qual é o seu?",
          options: list.slice(0, 5).map((p) => ({
            id: p.id ?? null,
            label: `${p.name || "Paciente"}${p.cpf ? " — CPF " + p.cpf : ""}`,
          })),
          nextAction: "choose_patient",
        });
      }

      return contract.ok({ data: list[0], nextAction: "patient_found" });
    }

    // PATIENT GET
    if (op === "patient.get") {
      const id = toId(data?.id ?? data?.patientId);
      if (!id) return contract.error("patient.get: id inválido");
      const r = await GET(`/partners/patient/${id}`);
      return contract.ok({ data: r?.data ?? r, nextAction: "patient_loaded" });
    }

    // PATIENT CREATE
    if (op === "patient.create") {
      const payload = buildPatientCreatePayload(data || {});
      if (!payload.name)
        return contract.error("patient.create: name é obrigatório");
      if (!payload.cpf || payload.cpf.length !== 11)
        return contract.error("patient.create: CPF inválido");
      if (!payload.birthday)
        return contract.error(
          "patient.create: birthday é obrigatório (YYYY-MM-DD)"
        );
      const r = await POST("/partners/patient", payload);
      return contract.ok({ data: r?.data ?? r, nextAction: "patient_created" });
    }

    // PATIENT UPDATE
    if (op === "patient.update") {
      const payload = buildPatientUpdatePayload(data || {});
      if (!payload.name)
        return contract.error("patient.update: name é obrigatório");
      if (!payload.cpf || payload.cpf.length !== 11)
        return contract.error("patient.update: CPF inválido");
      if (!payload.birthday)
        return contract.error(
          "patient.update: birthday é obrigatório (YYYY-MM-DD)"
        );
      const r = await PUT("/partners/patient", payload);
      return contract.ok({ data: r?.data ?? r, nextAction: "patient_updated" });
    }

    // PATIENT DELETE
    if (op === "patient.delete") {
      const id = toId(data?.id ?? data?.patientId);
      if (!id) return contract.error("patient.delete: id inválido");
      const r = await DEL(`/partners/patient/${id}`);
      return contract.ok({ data: r?.data ?? r, nextAction: "patient_deleted" });
    }

    // SPECIALITY / PROFESSIONAL search
    if (op === "speciality.search") {
      const r = await POST(
        "/partners/speciality/search",
        buildSearchPayload(data || {})
      );
      return contract.ok({ data: r, nextAction: "specialities_list" });
    }
    if (op === "professional.search") {
      const r = await POST(
        "/partners/performer/search",
        buildSearchPayload(data || {})
      );
      return contract.ok({ data: r, nextAction: "professionals_list" });
    }

    // PROCEDURE / INSURANCE search (necessário para agendar)
    if (op === "procedure.search") {
      const r = await POST(
        "/partners/procedure/search",
        buildSearchPayload(data || {})
      );
      return contract.ok({ data: r, nextAction: "procedures_list" });
    }
    if (op === "insurance.search") {
      const r = await POST(
        "/partners/insurance/search",
        buildSearchPayload(data || {})
      );
      return contract.ok({ data: r, nextAction: "insurances_list" });
    }

    // SCHEDULE SEARCH (v2) — busca agenda/agendamentos
    // Aceita alias "schedule.search.v2" para evitar mismatch com o agente.
    if (op === "schedule.search" || op === "schedule.search.v2") {
      const started = toDateYYYYMMDDLoose(data?.started);
      const ended = toDateYYYYMMDDLoose(data?.ended);

      if (!isDateYYYYMMDD(started) || !isDateYYYYMMDD(ended)) {
        return contract.error(
          "schedule.search: started/ended devem ser YYYY-MM-DD (pode enviar com hora que eu corto)"
        );
      }

      const body = {
        specialityId: data?.specialityId ?? null,
        performerId: data?.performerId ?? null,
        insuranceId: data?.insuranceId ?? null,
        procedureId: data?.procedureId ?? null,
        companyId: data?.companyId ?? null,
        confirm: Boolean(data?.confirm ?? false),
        status: data?.status ?? null,
        patientStatus: data?.patientStatus ?? null,
        started,
        ended,
      };

      const r = await POST("/partners/schedule/v2/search", body);
      return contract.ok({ data: r, nextAction: "schedules_list" });
    }

    // SCHEDULE CONFIRM — POST /partners/scheduleConfirm
    if (op === "schedule.confirm") {
      const scheduleId = toId(data?.scheduleId ?? data?.id);
      if (!scheduleId)
        return contract.error("schedule.confirm: scheduleId é obrigatório");

      try {
        const r = await POST("/partners/scheduleConfirm", { scheduleId });
        return contract.ok({
          data: r?.data ?? r,
          nextAction: "schedule_confirmed",
        });
      } catch {
        // fallback: marcar patientStatus C
        const r = await POST(`/partners/${scheduleId}/patientStatus/C`, {});
        return contract.ok({
          data: r?.data ?? r,
          nextAction: "schedule_confirmed",
        });
      }
    }

    // SCHEDULE CANCEL — POST /partners/scheduleCancel
    if (op === "schedule.cancel") {
      const scheduleId = toId(data?.scheduleId ?? data?.id);
      if (!scheduleId)
        return contract.error("schedule.cancel: scheduleId é obrigatório");

      try {
        const r = await POST("/partners/scheduleCancel", { scheduleId });
        return contract.ok({
          data: r?.data ?? r,
          nextAction: "schedule_cancelled",
        });
      } catch {
        // fallback: marcar patientStatus B
        const r = await POST(`/partners/${scheduleId}/patientStatus/B`, {});
        return contract.ok({
          data: r?.data ?? r,
          nextAction: "schedule_cancelled",
        });
      }
    }

    // SCHEDULE RESCHEDULE — PUT /partners/schedule (mesma regra do book)
    if (op === "schedule.reschedule") {
      const scheduleId = toId(data?.scheduleId);
      const insuranceId = toId(data?.insuranceId);
      const procedureId = toId(data?.procedureId);
      const patientId = toId(data?.patientId);

      if (!scheduleId)
        return contract.error("schedule.reschedule: scheduleId é obrigatório");
      if (!insuranceId)
        return contract.error("schedule.reschedule: insuranceId é obrigatório");
      if (!procedureId)
        return contract.error("schedule.reschedule: procedureId é obrigatório");

      let patient = null;
      if (!patientId) {
        const p = data?.patient || {};
        if (!p?.name || !p?.birthday || !p?.phoneStandart) {
          return contract.error(
            "schedule.reschedule: patientId ou patient{name,birthday,phoneStandart} é obrigatório"
          );
        }
        patient = {
          name: String(p.name).trim(),
          birthday: String(p.birthday).trim(),
          cpf: p.cpf ? onlyDigits(p.cpf) : "",
          cns: p.cns ?? "",
          phoneStandart: onlyDigits(p.phoneStandart),
        };
      }

      const body = {
        scheduleId,
        insuranceId,
        procedureId,
        patientId: patientId ?? null,
        patient: patientId ? null : patient,
      };

      const r = await PUT("/partners/schedule", body);
      return contract.ok({ data: r, nextAction: "schedule_rescheduled" });
    }

    // SCHEDULE BOOK — PUT /partners/schedule
    if (op === "schedule.book") {
      const scheduleId = toId(data?.scheduleId);
      const insuranceId = toId(data?.insuranceId);
      const procedureId = toId(data?.procedureId);
      const patientId = toId(data?.patientId);

      if (!scheduleId) return contract.error("schedule.book: scheduleId é obrigatório");
      if (!insuranceId) return contract.error("schedule.book: insuranceId é obrigatório");
      if (!procedureId) return contract.error("schedule.book: procedureId é obrigatório");

      // patientId OU patient obj
      let patient = null;
      if (!patientId) {
        const p = data?.patient || {};
        if (!p?.name || !p?.birthday || !p?.phoneStandart) {
          return contract.error(
            "schedule.book: patientId ou patient{name,birthday,phoneStandart} é obrigatório"
          );
        }
        patient = {
          name: String(p.name).trim(),
          birthday: String(p.birthday).trim(),
          cpf: p.cpf ? onlyDigits(p.cpf) : "",
          cns: p.cns ?? "",
          phoneStandart: onlyDigits(p.phoneStandart),
        };
      }

      const body = {
        scheduleId,
        insuranceId,
        procedureId,
        patientId: patientId ?? null,
        patient: patientId ? null : patient,
      };

      const r = await PUT("/partners/schedule", body);
      return contract.ok({ data: r, nextAction: "schedule_booked" });
    }

    return contract.error("Operação não suportada");
  } catch (err) {
    const details =
      err?.response?.data || err?.data || err?.message || String(err);
    console.error("RPC ENGINE ERROR:", err?.message || err);
    if (err?.response?.status) console.error("UPSTREAM STATUS:", err.response.status);
    if (err?.response?.data) console.error("UPSTREAM DATA:", err.response.data);
    if (err?.stack) console.error(err.stack);
    return { status: "error", message: "Instabilidade temporária", details };
  }
}
