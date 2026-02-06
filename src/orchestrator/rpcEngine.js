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
  if (!s) return false;
  const v = String(s).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function normalizeText(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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

// PATIENT payload (Clinicall exige campos bem específicos)
function buildPatientCreatePayload(input = {}) {
  const name = String(input?.name ?? "").trim();
  const cpf = onlyDigits(input?.cpf ?? "");
  const birthday = String(input?.birthday ?? input?.birthDate ?? "").trim(); // aceita birthDate como alias, mas envia birthday

  const payload = {
    name,
    cpf,
    birthday,
    phoneStandart: input?.phoneStandart ? onlyDigits(input.phoneStandart) : undefined,

    // Clinicall espera IDs (não objetos)
    genderId: input?.genderId ?? (input?.gender?.id ? Number(input.gender.id) : undefined),
    civilStatusId: input?.civilStatusId ?? (input?.civilStatus?.id ? Number(input.civilStatus.id) : undefined),
    insuranceId: input?.insuranceId ?? (input?.insurance?.id ? Number(input.insurance.id) : undefined),

    // address.*Id
    address: input?.address
      ? {
          address: input.address.address ?? undefined,
          district: input.address.district ?? undefined,
          zipcode: input.address.zipcode ?? undefined,
          description: input.address.description ?? undefined,
          number: input.address.number ?? undefined,
          addon: input.address.addon ?? undefined,
          addressTypeId: input.address.addressTypeId ?? undefined,
          cityId: input.address.cityId ?? undefined,
          countryId: input.address.countryId ?? undefined,
        }
      : undefined,
  };

  // remove undefined
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
  if (payload.address) {
    Object.keys(payload.address).forEach((k) => payload.address[k] === undefined && delete payload.address[k]);
    if (Object.keys(payload.address).length === 0) delete payload.address;
  }

  return payload;
}

// Search padrão do Clinicall (*/search)
function buildSearchBody(input = {}) {
  return {
    argument: String(input?.argument ?? "").trim(),
    page: Number.isFinite(Number(input?.page)) ? Number(input.page) : 0,
    sizePage: Number.isFinite(Number(input?.sizePage)) ? Number(input.sizePage) : 25,
    fieldSort: String(input?.fieldSort ?? "name"),
    sortDirection: String(input?.sortDirection ?? "asc"),
  };
}

export async function runRpc({ op, data } = {}) {
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
      if (!type) return contract.error("status.simpleList: type é obrigatório (patientStatus|scheduleStatus)");
      const r = await GET(`/partners/status/${type}/simpleList`);
      return contract.ok({ data: r, nextAction: "status_list" });
    }

    // PATIENT SEARCH
    if (op === "patient.search") {
      const body = buildSearchBody(data || {});
      if (!body.argument) return contract.error("patient.search: argument é obrigatório (cpf ou nome)");

      const r = await POST("/partners/patient/search", body);

      // normaliza opções para UX do agente
      const list = Array.isArray(r?.content) ? r.content : Array.isArray(r?.data?.content) ? r.data.content : [];
      const options = list.slice(0, 25).map((p) => ({
        id: p.id,
        label: `${String(p.name || "").trim()} — CPF ${String(p.cpf || "").trim()}`.trim(),
      }));

      if (!options.length) {
        return contract.ok({
          data: [],
          options: [],
          nextAction: "patient_not_found",
          message: "Certo. Não encontrei cadastro com esses dados. Posso fazer seu cadastro agora.",
        });
      }

      if (options.length === 1) {
        return contract.ok({
          data: { id: options[0].id, label: options[0].label },
          options: [],
          nextAction: "patient_found_single",
        });
      }

      return contract.ok({
        data: {},
        options,
        nextAction: "choose_patient",
        message: "Entendi. Encontrei mais de um cadastro parecido. Qual é o seu?",
      });
    }

    // PATIENT GET
    if (op === "patient.get") {
      const id = toId(data?.id ?? data?.patientId);
      if (!id) return contract.error("patient.get: id inválido");
      const r = await GET(`/partners/patient/${id}`);
      return contract.ok({ data: r, nextAction: "patient_loaded" });
    }

    // PATIENT CREATE
    if (op === "patient.create") {
      const payload = buildPatientCreatePayload(data || {});
      if (!payload.name) return contract.error("patient.create: name é obrigatório");
      if (!payload.cpf || payload.cpf.length !== 11) return contract.error("patient.create: CPF inválido");
      if (!payload.birthday) return contract.error("patient.create: birthday é obrigatório (YYYY-MM-DD)");

      const r = await POST("/partners/patient", payload);
      return contract.ok({ data: r?.data ?? r, nextAction: "patient_created" });
    }

    // PATIENT DELETE
    if (op === "patient.delete") {
      const id = toId(data?.id ?? data?.patientId);
      if (!id) return contract.error("patient.delete: id inválido");
      const r = await DEL(`/partners/patient/${id}`);
      return contract.ok({ data: r?.data ?? r, nextAction: "patient_deleted" });
    }

    // SPECIALITY search
    if (op === "speciality.search") {
      const body = buildSearchBody(data || {});
      if (!body.argument) return contract.error("speciality.search: argument é obrigatório");
      const r = await POST("/partners/speciality/search", body);
      return contract.ok({ data: r, nextAction: "specialities_list" });
    }

    // PROFESSIONAL search
    if (op === "professional.search") {
      const body = buildSearchBody(data || {});
      if (!body.argument) return contract.error("professional.search: argument é obrigatório");
      const r = await POST("/partners/professional/search", body);
      return contract.ok({ data: r, nextAction: "professionals_list" });
    }

    // DOCTOR search (alias p/ profissional executante)
    if (op === "doctor.search") {
      const body = buildSearchBody(data || {});
      if (!body.argument) return contract.error("doctor.search: argument é obrigatório");
      const r = await POST("/partners/professional/searchPerformer", body);
      return contract.ok({ data: r, nextAction: "professionals_list" });
    }

    // PROCEDURE search
    if (op === "procedure.search") {
      const body = buildSearchBody(data || {});
      if (!body.argument) return contract.error("procedure.search: argument é obrigatório");
      const r = await POST("/partners/procedure/search", body);
      return contract.ok({ data: r, nextAction: "procedures_list" });
    }

    // INSURANCE search
    if (op === "insurance.search") {
      const body = buildSearchBody(data || {});
      if (!body.argument) return contract.error("insurance.search: argument é obrigatório");
      const r = await POST("/partners/insurance/search", body);
      return contract.ok({ data: r, nextAction: "insurances_list" });
    }

    // SCHEDULE SEARCH (v2) — POST /partners/schedule/v2/search
    // Aceita op "schedule.search" e alias "schedule.search.v2"
    if (op === "schedule.search" || op === "schedule.search.v2") {
      const startedRaw = String(data?.started ?? "");
      const endedRaw = String(data?.ended ?? "");

      // API v2/search usa datas (YYYY-MM-DD). Se vier com hora, corta.
      const started = startedRaw.includes("T") ? startedRaw.split("T")[0] : startedRaw;
      const ended = endedRaw.includes("T") ? endedRaw.split("T")[0] : endedRaw;

      if (!isDateYYYYMMDD(started) || !isDateYYYYMMDD(ended)) {
        return contract.error("schedule.search: started/ended devem ser YYYY-MM-DD (sem hora)");
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
          return contract.error("schedule.book: patientId ou patient{name,birthday,phoneStandart} é obrigatório");
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

    // SCHEDULE CONFIRM — GET/POST /partners/scheduleConfirm
    // - GET /partners/scheduleConfirm/:scheduleId (buscar status)
    // - POST /partners/scheduleConfirm (confirmar)
    if (op === "schedule.confirm.get") {
      const scheduleId = toId(data?.scheduleId ?? data?.id);
      if (!scheduleId) return contract.error("schedule.confirm.get: scheduleId é obrigatório");
      const r = await GET(`/partners/scheduleConfirm/${scheduleId}`);
      return contract.ok({ data: r, nextAction: "schedule_confirm_loaded" });
    }

    if (op === "schedule.confirm") {
      const scheduleId = toId(data?.scheduleId ?? data?.id);
      if (!scheduleId) return contract.error("schedule.confirm: scheduleId é obrigatório");
      const r = await POST("/partners/scheduleConfirm", { scheduleId });
      return contract.ok({ data: r, nextAction: "schedule_confirmed" });
    }

    // SCHEDULE CANCEL — POST /partners/scheduleCancel
    if (op === "schedule.cancel") {
      const scheduleId = toId(data?.scheduleId ?? data?.id);
      if (!scheduleId) return contract.error("schedule.cancel: scheduleId é obrigatório");
      const r = await POST("/partners/scheduleCancel", { scheduleId });
      return contract.ok({ data: r, nextAction: "schedule_cancelled" });
    }

    // BOOK + CONFIRM (atalho) — usa schedule.book e depois schedule.confirm
    if (op === "schedule.bookAndConfirm") {
      const scheduleId = toId(data?.scheduleId);
      const insuranceId = toId(data?.insuranceId);
      const procedureId = toId(data?.procedureId);
      const patientId = toId(data?.patientId);

      if (!scheduleId) return contract.error("schedule.bookAndConfirm: scheduleId é obrigatório");
      if (!insuranceId) return contract.error("schedule.bookAndConfirm: insuranceId é obrigatório");
      if (!procedureId) return contract.error("schedule.bookAndConfirm: procedureId é obrigatório");
      if (!patientId) return contract.error("schedule.bookAndConfirm: patientId é obrigatório");

      // 1) book
      const booked = await PUT("/partners/schedule", {
        scheduleId,
        insuranceId,
        procedureId,
        patientId,
        patient: null,
      });

      // 2) confirm
      const confirmed = await POST("/partners/scheduleConfirm", { scheduleId });

      return contract.ok({
        data: { booked, confirmed },
        nextAction: "schedule_booked_confirmed",
      });
    }

    return contract.error("Operação não suportada");
  } catch (err) {
    const details = err?.response?.data || err?.data || err?.message || String(err);
    console.error("RPC ENGINE ERROR:", err?.message || err);
    if (err?.response?.status) console.error("UPSTREAM STATUS:", err.response.status);
    if (err?.response?.data) console.error("UPSTREAM DATA:", err.response.data);
    if (err?.stack) console.error(err.stack);
    return { status: "error", message: "Instabilidade temporária", details };
  }
}
