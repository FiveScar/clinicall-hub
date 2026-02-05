// src/orchestrator/rpcEngine.js
import clinicall from "../clinicall/client.js";
import * as contract from "./contract.js";

/**
 * Helpers
 */
function onlyDigits(v) {
  return String(v ?? "").replace(/\D+/g, "");
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
 * buildPatientCreatePayload — WHITELIST + IDs planos (conforme doc Clinicall)
 * CREATE: birthday + genderId/civilStatusId/insuranceId + address.cityId/addressTypeId
 */
function buildPatientCreatePayload(input = {}) {
  const payload = {};

  // Required
  payload.name = String(input.name ?? "").trim();
  payload.cpf = onlyDigits(input.cpf);

  // Clinicall espera birthday (YYYY-MM-DD)
  const birthday = input.birthday ?? input.birthDate ?? input.birthdate;
  if (birthday != null) payload.birthday = String(birthday).trim();

  // Optional
  if (input.mother !== undefined) payload.mother = input.mother;
  if (input.email !== undefined) payload.email = input.email;
  if (input.identity !== undefined) payload.identity = input.identity;
  if (input.active !== undefined) payload.active = Boolean(input.active);

  const phone = onlyDigits(input.phoneStandart ?? input.phone);
  if (phone) payload.phoneStandart = phone;

  // IDs planos
  const genderId = toId(input.genderId);
  if (genderId) payload.genderId = genderId;

  const civilStatusId = toId(input.civilStatusId);
  if (civilStatusId) payload.civilStatusId = civilStatusId;

  const insuranceId = toId(input.insuranceId);
  if (insuranceId) payload.insuranceId = insuranceId;

  const companyId = toId(input.companyId);
  if (companyId) payload.companyId = companyId;

  // Address (IDs planos)
  if (input.address) {
    const a = input.address;

    const addressTypeId = toId(a.addressTypeId);
    const cityId = toId(a.cityId);
    const countryId = toId(a.countryId) ?? 1;

    if (!addressTypeId) throw new Error("patient.create: address.addressTypeId é obrigatório quando address é informado");
    if (!cityId) throw new Error("patient.create: address.cityId é obrigatório quando address é informado");

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
      country: a.country ?? "Brasil", // se o tenant aceitar string, ok; se não, remova
    };
  }

  return payload;
}

/**
 * buildPatientUpdatePayload — UPDATE (PUT /partners/patient) costuma aceitar objetos (id), mas
 * vamos manter também IDs planos para evitar rejeição.
 */
function buildPatientUpdatePayload(input = {}) {
  const payload = {};

  const id = toId(input.id ?? input.patientId);
  if (id) payload.id = id;

  if (input.name != null) payload.name = String(input.name).trim();
  if (input.cpf != null) payload.cpf = onlyDigits(input.cpf);

  const birthday = input.birthday ?? input.birthDate ?? input.birthdate;
  if (birthday != null) payload.birthday = String(birthday).trim();

  if (input.mother !== undefined) payload.mother = input.mother;
  if (input.email !== undefined) payload.email = input.email;
  if (input.identity !== undefined) payload.identity = input.identity;
  if (input.active !== undefined) payload.active = Boolean(input.active);

  const phone = onlyDigits(input.phoneStandart ?? input.phone);
  if (phone) payload.phoneStandart = phone;

  const genderId = toId(input.genderId ?? input.gender?.id);
  if (genderId) payload.genderId = genderId;

  const civilStatusId = toId(input.civilStatusId ?? input.civilStatus?.id);
  if (civilStatusId) payload.civilStatusId = civilStatusId;

  const insuranceId = toId(input.insuranceId ?? input.insurance?.id);
  if (insuranceId) payload.insuranceId = insuranceId;

  const companyId = toId(input.companyId);
  if (companyId) payload.companyId = companyId;

  if (input.address) {
    const a = input.address;
    const addressTypeId = toId(a.addressTypeId ?? a.addressType?.id);
    const cityId = toId(a.cityId ?? a.city?.id);
    const countryId = toId(a.countryId ?? a.country?.id) ?? 1;

    if (addressTypeId && cityId) {
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
  }

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
    // COMPANIES
    if (op === "companies.list") {
      const r = await GET("/partners/company");
      return contract.ok({ data: r, nextAction: "companies_list" });
    }

    // PATIENT SEARCH (sem telefone)
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

    // PATIENT GET
    if (op === "patient.get") {
      const id = toId(data?.id ?? data?.patientId);
      if (!id) return contract.error("patient.get: id inválido");
      const r = await GET(`/partners/patient/${id}`);
      return contract.ok({ data: r?.data ?? r, nextAction: "patient_loaded" });
    }

    // PATIENT CREATE (IDs planos + birthday)
    if (op === "patient.create") {
      const payload = buildPatientCreatePayload(data || {});

      if (!payload.name) return contract.error("patient.create: name é obrigatório");
      if (!payload.cpf || payload.cpf.length !== 11) return contract.error("patient.create: CPF inválido");
      if (!payload.birthday) return contract.error("patient.create: birthday é obrigatório (YYYY-MM-DD)");

      const r = await POST("/partners/patient", payload);
      return contract.ok({ data: r?.data ?? r, nextAction: "patient_created" });
    }

    // PATIENT UPDATE
    if (op === "patient.update") {
      const payload = buildPatientUpdatePayload(data || {});
      if (!payload.id) return contract.error("patient.update: id inválido");
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

    // SPECIALITIES / PROFESSIONALS
    if (op === "speciality.search") {
      const r = await POST("/partners/speciality/search", buildSearchPayload(data || {}));
      return contract.ok({ data: r, nextAction: "specialities_list" });
    }

    if (op === "professional.search") {
      const r = await POST("/partners/performer/search", buildSearchPayload(data || {}));
      return contract.ok({ data: r, nextAction: "professionals_list" });
    }

    // SCHEDULES
    if (op === "schedule.search") {
      const r = await POST("/partners/schedule/v2/search", data || {});
      return contract.ok({ data: r, nextAction: "schedules_list" });
    }

    if (op === "schedule.book" || op === "schedule.create") {
      const p = data || {};
      if (!p.patientId || !p.performerId || !p.started) {
        return contract.fallback({
          message: "Perfeito. Para marcar, preciso do paciente, do profissional e do horário.",
          nextAction: "ask_missing_booking_fields",
        });
      }
      const r = await POST("/partners/schedule", p);
      return contract.ok({ data: r, nextAction: "schedule_created" });
    }

    if (op === "schedule.reschedule" || op === "schedule.update") {
      const p = data || {};
      if (!p.id && !p.scheduleId) {
        return contract.fallback({
          message: "Certo. Para remarcar, preciso do identificador da consulta.",
          nextAction: "ask_schedule_id",
        });
      }
      if (!p.id && p.scheduleId) p.id = p.scheduleId;
      const r = await PUT("/partners/schedule", p);
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
    const details = err?.response?.data || err?.data || err?.message || String(err);

    console.error("RPC ENGINE ERROR:", err?.message || err);
    if (err?.response?.status) console.error("UPSTREAM STATUS:", err.response.status);
    if (err?.response?.data) console.error("UPSTREAM DATA:", err.response.data);
    if (err?.stack) console.error(err.stack);

    return { status: "error", message: "Instabilidade temporária", details };
  }
}
