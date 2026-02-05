// src/orchestrator/rpcEngine.js
import clinicall from "../clinicall/client.js";
import * as contract from "./contract.js";

/**
 * Helpers
 */
function onlyDigits(v) {
  return String(v ?? "").replace(/\D+/g, "");
}

function toIdObject(v) {
  const id = Number(v?.id ?? v);
  return Number.isFinite(id) && id > 0 ? { id } : null;
}

function toId(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
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
 * buildPatientPayload — WHITELIST
 * NUNCA use ...rest com Clinicall.
 */
function buildPatientPayload(input = {}) {
  const payload = {};

  // Required-ish (tenant-dependent)
  if (input.name != null) payload.name = String(input.name).trim();
  if (input.cpf != null) payload.cpf = onlyDigits(input.cpf);

  // Date field: alguns tenants usam birthDate, outros birthday.
  // Mantemos birthDate porque foi o que você vem usando nos testes.
  if (input.birthDate != null) payload.birthDate = String(input.birthDate).trim();
  if (input.birthdate != null && payload.birthDate == null) payload.birthDate = String(input.birthdate).trim();
  if (input.birthday != null && payload.birthDate == null) payload.birthDate = String(input.birthday).trim();

  if (input.mother !== undefined) payload.mother = input.mother;
  if (input.email !== undefined) payload.email = input.email;
  if (input.identity !== undefined) payload.identity = input.identity;
  if (input.active !== undefined) payload.active = Boolean(input.active);

  // phoneStandart
  if (input.phoneStandart != null) payload.phoneStandart = onlyDigits(input.phoneStandart);
  if (input.phone != null && payload.phoneStandart == null) payload.phoneStandart = onlyDigits(input.phone);

  // medicalRecord (aparece no GET, pode ser exigido em alguns tenants)
  if (input.medicalRecord != null) payload.medicalRecord = String(input.medicalRecord).trim();

  // Relacionamentos: sempre { id }
  const gender = toIdObject(input.genderId ?? input.gender);
  if (gender) payload.gender = gender;

  const civilStatus = toIdObject(input.civilStatusId ?? input.civilStatus);
  if (civilStatus) payload.civilStatus = civilStatus;

  const insurance = toIdObject(input.insuranceId ?? input.insurance);
  if (insurance) payload.insurance = insurance;

  // companyId (se seu tenant usar)
  const companyId = toId(input.companyId);
  if (companyId) payload.companyId = companyId;

  // Address: só entra se você mandar address
  if (input.address) {
    const a = input.address;

    const addressTypeId = toId(a.addressTypeId ?? a.addressType?.id);
    const cityId = toId(a.cityId ?? a.city?.id);
    const countryId = toId(a.countryId ?? a.country?.id) ?? 1;

    // Clinicall já te disse: addressTypeId é obrigatório quando manda endereço
    if (!addressTypeId) {
      throw new Error("patient.create: addressTypeId é obrigatório quando address é informado");
    }
    if (!cityId) {
      throw new Error("patient.create: cityId é obrigatório quando address é informado");
    }

    payload.address = {
      address: a.address ?? "",
      district: a.district ?? "",
      zipcode: onlyDigits(a.zipcode),
      description: a.description ?? null,
      addon: a.addon ?? null,
      number: a.number != null ? String(a.number) : null,

      // O que o tenant pediu explicitamente
      addressTypeId,
      cityId,
      countryId,

      // Alguns tenants exigem também objeto city/addressType
      addressType: { id: addressTypeId },
      city: { id: cityId },
      country: { id: countryId },
    };
  }

  return payload;
}

/**
 * buildSchedulePayload — mínimo útil para agenda
 */
function buildSchedulePayload(input = {}) {
  const payload = { ...input };

  // aliases
  if (payload.doctorId != null && payload.performerId == null) payload.performerId = payload.doctorId;
  if (payload.specialtyId != null && payload.specialityId == null) payload.specialityId = payload.specialtyId;

  // date+time -> started
  if (!payload.started && payload.date && payload.time) payload.started = `${payload.date}T${payload.time}`;

  return payload;
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
    // -------------------------
    // COMPANIES
    // -------------------------
    if (op === "companies.list") {
      const r = await GET("/partners/company");
      return contract.ok({ data: r, nextAction: "companies_list" });
    }

    // -------------------------
    // PATIENTS
    // -------------------------
    if (op === "patient.search") {
      const body = buildSearchPayload({
        argument: String(data?.argument ?? "").trim(),
        page: 0,
        sizePage: 25,
        fieldSort: "name",
        sortDirection: "asc",
      });

      if (!body.argument) {
        return contract.fallback({
          message: "Perfeito. Me informe seu nome completo e CPF para eu localizar seu cadastro.",
          nextAction: "ask_name_cpf",
        });
      }

      // PROIBIDO: heurística de telefone
      const digits = onlyDigits(body.argument);
      if (digits.length === 10 || digits.length === 11) {
        return contract.fallback({
          message: "Perfeito. Me informe seu nome completo e CPF para eu localizar seu cadastro.",
          nextAction: "ask_name_cpf",
        });
      }

      const r = await POST("/partners/patient/search", body);
      const list = Array.isArray(r?.content) ? r.content : [];

      if (!list.length) {
        return contract.ok({
          message: "Certo. Não encontrei cadastro com esses dados. Posso fazer seu cadastro agora.",
          data: [],
          nextAction: "patient_not_found",
        });
      }

      if (list.length > 1) {
        return contract.ok({
          message: "Entendi. Encontrei mais de um cadastro parecido. Qual é o seu?",
          options: list.slice(0, 5).map((p) => ({
            id: p.id ?? null,
            label: `${p.name || "Paciente"}${p.cpf ? " — CPF " + p.cpf : ""}`,
          })),
          nextAction: "choose_patient",
        });
      }

      return contract.ok({ data: list[0], nextAction: "patient_found" });
    }

    if (op === "patient.get") {
      const id = toId(data?.id ?? data?.patientId);
      if (!id) return contract.error("patient.get: id inválido");
      const r = await GET(`/partners/patient/${id}`);
      return contract.ok({ data: r?.data ?? r, nextAction: "patient_loaded" });
    }

    if (op === "patient.create") {
      const payload = buildPatientPayload(data || {});

      if (!payload.name) return contract.error("patient.create: name é obrigatório");
      if (!payload.cpf || payload.cpf.length !== 11) return contract.error("patient.create: CPF inválido");

      const r = await POST("/partners/patient", payload);
      return contract.ok({ data: r?.data ?? r, nextAction: "patient_created" });
    }

    if (op === "patient.update") {
      const id = toId(data?.id ?? data?.patientId);
      if (!id) return contract.error("patient.update: id inválido");
      const payload = buildPatientPayload({ ...(data || {}), id });
      payload.id = id;
      const r = await PUT("/partners/patient", payload);
      return contract.ok({ data: r?.data ?? r, nextAction: "patient_updated" });
    }

    if (op === "patient.delete") {
      const id = toId(data?.id ?? data?.patientId);
      if (!id) return contract.error("patient.delete: id inválido");
      const r = await DEL(`/partners/patient/${id}`);
      return contract.ok({ data: r?.data ?? r, nextAction: "patient_deleted" });
    }

    // -------------------------
    // SPECIALITY / PROFESSIONAL
    // -------------------------
    if (op === "speciality.search") {
      const r = await POST("/partners/speciality/search", buildSearchPayload(data || {}));
      return contract.ok({ data: r, nextAction: "specialities_list" });
    }

    if (op === "professional.search") {
      const r = await POST("/partners/performer/search", buildSearchPayload(data || {}));
      return contract.ok({ data: r, nextAction: "professionals_list" });
    }

    // -------------------------
    // SCHEDULES
    // -------------------------
    if (op === "schedule.search") {
      const r = await POST("/partners/schedule/v2/search", buildSchedulePayload(data || {}));
      return contract.ok({ data: r, nextAction: "schedules_list" });
    }

    if (op === "schedule.book" || op === "schedule.create") {
      const payload = buildSchedulePayload(data || {});
      if (!payload.patientId || !payload.performerId || !payload.started) {
        return contract.fallback({
          message: "Perfeito. Para marcar, preciso do paciente, do profissional e do horário.",
          nextAction: "ask_missing_booking_fields",
        });
      }
      const r = await POST("/partners/schedule", payload);
      return contract.ok({ data: r, nextAction: "schedule_created" });
    }

    if (op === "schedule.reschedule" || op === "schedule.update") {
      const payload = buildSchedulePayload(data || {});
      if (!payload.id && !payload.scheduleId) {
        return contract.fallback({
          message: "Certo. Para remarcar, preciso do identificador da consulta.",
          nextAction: "ask_schedule_id",
        });
      }
      if (!payload.id && payload.scheduleId) payload.id = payload.scheduleId;
      const r = await PUT("/partners/schedule", payload);
      return contract.ok({ data: r, nextAction: "schedule_updated" });
    }

    if (op === "schedule.confirm") {
      const id = toId(data?.id ?? data?.scheduleId);
      if (!id) return contract.fallback({ message: "Certo. Preciso do id da consulta.", nextAction: "ask_schedule_id" });

      try {
        const r = await POST("/partners/scheduleConfirm", { scheduleId: id });
        return contract.ok({ data: r, nextAction: "schedule_confirmed" });
      } catch {
        const r2 = await POST(`/partners/${id}/patientStatus/C`, {});
        return contract.ok({ data: r2, nextAction: "schedule_confirmed" });
      }
    }

    if (op === "schedule.cancel") {
      const id = toId(data?.id ?? data?.scheduleId);
      if (!id) return contract.fallback({ message: "Certo. Preciso do id da consulta.", nextAction: "ask_schedule_id" });

      try {
        const r = await POST("/partners/scheduleCancel", { scheduleId: id });
        return contract.ok({ data: r, nextAction: "schedule_cancelled" });
      } catch {
        const r2 = await POST(`/partners/${id}/patientStatus/B`, {});
        return contract.ok({ data: r2, nextAction: "schedule_cancelled" });
      }
    }

    return contract.error("Operação não suportada");
  } catch (err) {
    const details =
      err?.response?.data ||
      err?.data ||
      err?.message ||
      String(err);

    console.error("RPC ENGINE ERROR:", err?.message || err);
    if (err?.response?.status) console.error("UPSTREAM STATUS:", err.response.status);
    if (err?.response?.data) console.error("UPSTREAM DATA:", err.response.data);
    if (err?.stack) console.error(err.stack);

    return {
      status: "error",
      message: "Instabilidade temporária",
      details,
    };
  }
}
