// src/orchestrator/rpcEngine.js
import clinicall from "../clinicall/client.js";
import * as contract from "./contract.js";

/**
 * RPC Engine — Clinicall RPC Hub
 * - Expõe via /rpc operações equivalentes aos endpoints REST do hub.
 * - Todas as chamadas reais são feitas via clinicall.request (upstream Clinicall).
 * - IMPORTANTE: Clinicall NÃO tem search por telefone -> nunca fazer heurística de telefone.
 */

function asId(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : s;
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

function buildPatientPayload(input = {}) {
  const {
    id,
    patientId,
    name,
    cpf,
    birthDate,
    birthdate,
    phone,
    phoneStandart,
    ...rest
  } = input;

  const payload = {
    ...rest,
  };

  const finalId = asId(id ?? patientId);
  if (finalId != null) payload.id = finalId;

  if (name != null) payload.name = name;
  if (cpf != null) payload.cpf = cpf;

  const bd = birthDate ?? birthdate;
  if (bd != null) payload.birthDate = bd;

  // telefone pode existir no cadastro, mas NÃO é usado pra busca
  const ps = phoneStandart ?? phone;
  if (ps != null) payload.phoneStandart = ps;

  return payload;
}

function buildSchedulePayload(input = {}) {
  const {
    id,
    scheduleId,
    patientId,
    performerId,
    doctorId,
    specialityId,
    specialtyId,
    date,
    time,
    started,
    ended,
    ...rest
  } = input;

  const payload = { ...rest };

  const finalId = asId(id ?? scheduleId);
  if (finalId != null) payload.id = finalId;

  if (patientId != null) payload.patientId = asId(patientId);
  if (performerId != null) payload.performerId = asId(performerId);
  if (doctorId != null && payload.performerId == null) payload.performerId = asId(doctorId);

  if (specialityId != null) payload.specialityId = asId(specialityId);
  if (specialtyId != null && payload.specialityId == null) payload.specialityId = asId(specialtyId);

  if (started != null) payload.started = started;
  if (ended != null) payload.ended = ended;

  // aceita date+time -> started
  if (!payload.started && date && time) payload.started = `${date}T${time}`;

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
    /**
     * =========================
     * AUTH / COMPANIES
     * =========================
     */

    // GET /companies  (hub) -> GET /partners/company (clinicall)
    if (op === "companies.list") {
      const r = await GET("/partners/company");
      return contract.ok({ data: r, nextAction: "companies_list" });
    }

    // GET /companies/:id (hub) -> GET /partners/company/:id (clinicall)
    if (op === "companies.get") {
      const id = asId(data?.id ?? data?.companyId);
      if (!id) return contract.fallback({ message: "Certo. Me informe o id da empresa.", nextAction: "ask_company_id" });
      const r = await GET(`/partners/company/${encodeURIComponent(String(id))}`);
      return contract.ok({ data: r, nextAction: "company_loaded" });
    }

    /**
     * =========================
     * PATIENTS (CRUD + SEARCH + BIRTHDAY)
     * =========================
     */

    // POST /patients/search (hub) -> POST /partners/patient/search
    // (CPF ou nome — SEM telefone)
    if (op === "patient.search") {
      const payload = buildSearchPayload(data || {});
      const arg = String(payload.argument || "").trim();

      if (!arg) {
        return contract.fallback({
          message: "Perfeito. Me informe seu CPF (ou nome completo) para eu localizar seu cadastro.",
          nextAction: "ask_patient_identifier",
        });
      }

      const r = await POST("/partners/patient/search", payload);
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

    // GET /patients/:id (hub) -> GET /partners/patient/:id
    if (op === "patient.get") {
      const id = asId(data?.id ?? data?.patientId);
      if (!id) return contract.fallback({ message: "Certo. Me informe o id do paciente.", nextAction: "ask_patient_id" });
      const r = await GET(`/partners/patient/${encodeURIComponent(String(id))}`);
      return contract.ok({ data: r, nextAction: "patient_loaded" });
    }

    // POST /patients (hub) -> POST /partners/patient
    if (op === "patient.create") {
      const payload = buildPatientPayload(data || {});
      if (!payload?.name || !payload?.cpf) {
        return contract.fallback({
          message: "Perfeito. Para criar o cadastro, preciso do nome completo e CPF.",
          nextAction: "ask_patient_create_fields",
        });
      }
      const r = await POST("/partners/patient", payload);
      return contract.ok({ data: r, nextAction: "patient_created" });
    }

    // PUT /patients/:id (hub) -> PUT /partners/patient (id no body)
    if (op === "patient.update") {
      const id = asId(data?.id ?? data?.patientId);
      if (!id) return contract.fallback({ message: "Certo. Me informe o id do paciente.", nextAction: "ask_patient_id" });
      const payload = buildPatientPayload({ ...(data || {}), id });
      const r = await PUT("/partners/patient", payload);
      return contract.ok({ data: r, nextAction: "patient_updated" });
    }

    // DELETE /patients/:id (hub) -> DELETE /partners/patient/:id
    if (op === "patient.delete") {
      const id = asId(data?.id ?? data?.patientId);
      if (!id) return contract.fallback({ message: "Certo. Me informe o id do paciente.", nextAction: "ask_patient_id" });
      const r = await DEL(`/partners/patient/${encodeURIComponent(String(id))}`);
      return contract.ok({ data: r, nextAction: "patient_deleted" });
    }

    // GET /patients/birthday/today-month/:day
    if (op === "patient.birthday.todayMonthDay") {
      const day = asId(data?.day);
      if (!day) return contract.fallback({ message: "Certo. Me informe o dia (1 a 31).", nextAction: "ask_day" });
      const r = await GET(`/partners/patient/birthday/today-month/${encodeURIComponent(String(day))}`);
      return contract.ok({ data: r, nextAction: "birthday_list" });
    }

    // GET /patients/birthday/today-month/:month/:day
    if (op === "patient.birthday.todayMonth") {
      const month = asId(data?.month);
      const day = asId(data?.day);
      if (!month || !day) {
        return contract.fallback({ message: "Certo. Me informe mês e dia.", nextAction: "ask_month_day" });
      }
      const r = await GET(
        `/partners/patient/birthday/today-month/${encodeURIComponent(String(month))}/${encodeURIComponent(String(day))}`
      );
      return contract.ok({ data: r, nextAction: "birthday_list" });
    }

    /**
     * =========================
     * SPECIALITIES / PROFESSIONALS / PROCEDURES / INSURANCES
     * =========================
     */

    // POST /specialities/search (hub) -> POST /partners/speciality/search
    if (op === "speciality.search") {
      const payload = buildSearchPayload(data || {});
      const r = await POST("/partners/speciality/search", payload);
      return contract.ok({ data: r, nextAction: "specialities_list" });
    }

    // POST /professionals/search (hub) -> POST /partners/performer/search
    if (op === "professional.search") {
      const payload = buildSearchPayload(data || {});
      if (data?.specialityId != null) payload.specialityId = asId(data.specialityId);
      if (data?.specialtyId != null && payload.specialityId == null) payload.specialityId = asId(data.specialtyId);
      const r = await POST("/partners/performer/search", payload);
      return contract.ok({ data: r, nextAction: "professionals_list" });
    }

    // POST /procedures/search (hub) -> POST /partners/procedure/search
    if (op === "procedure.search") {
      const payload = buildSearchPayload(data || {});
      const r = await POST("/partners/procedure/search", payload);
      return contract.ok({ data: r, nextAction: "procedures_list" });
    }

    // POST /insurances/search (hub) -> POST /partners/insurance/search
    if (op === "insurance.search") {
      const payload = buildSearchPayload(data || {});
      const r = await POST("/partners/insurance/search", payload);
      return contract.ok({ data: r, nextAction: "insurances_list" });
    }

    /**
     * =========================
     * SCHEDULES
     * =========================
     */

    // POST /schedules/search (hub) -> POST /partners/schedule/v2/search
    if (op === "schedule.search") {
      const payload = buildSchedulePayload(data || {});
      const r = await POST("/partners/schedule/v2/search", payload);
      return contract.ok({ data: r, nextAction: "schedules_list" });
    }

    // POST /schedules (hub) -> POST /partners/schedule
    // alias: schedule.book / schedule.create
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

    // PUT /schedules (hub) -> PUT /partners/schedule
    // alias: schedule.reschedule / schedule.update
    if (op === "schedule.reschedule" || op === "schedule.update") {
      const payload = buildSchedulePayload(data || {});
      if (!payload.id) {
        return contract.fallback({
          message: "Certo. Para remarcar, preciso do identificador da consulta.",
          nextAction: "ask_schedule_id",
        });
      }
      const r = await PUT("/partners/schedule", payload);
      return contract.ok({ data: r, nextAction: "schedule_updated" });
    }

    // POST /schedules/confirm (hub) -> POST /partners/scheduleConfirm
    // fallback -> POST /partners/:id/patientStatus/C
    if (op === "schedule.confirm") {
      const id = asId(data?.id ?? data?.scheduleId);
      if (!id) {
        return contract.fallback({
          message: "Certo. Para confirmar, preciso do identificador da consulta.",
          nextAction: "ask_schedule_id",
        });
      }

      try {
        const r = await POST("/partners/scheduleConfirm", { scheduleId: id });
        return contract.ok({ data: r, nextAction: "schedule_confirmed" });
      } catch {
        const r2 = await POST(`/partners/${encodeURIComponent(String(id))}/patientStatus/C`, {});
        return contract.ok({ data: r2, nextAction: "schedule_confirmed" });
      }
    }

    // POST /schedules/cancel (hub) -> POST /partners/scheduleCancel
    // fallback -> POST /partners/:id/patientStatus/B
    if (op === "schedule.cancel") {
      const id = asId(data?.id ?? data?.scheduleId);
      if (!id) {
        return contract.fallback({
          message: "Certo. Para cancelar, preciso do identificador da consulta.",
          nextAction: "ask_schedule_id",
        });
      }

      try {
        const r = await POST("/partners/scheduleCancel", { scheduleId: id });
        return contract.ok({ data: r, nextAction: "schedule_cancelled" });
      } catch {
        const r2 = await POST(`/partners/${encodeURIComponent(String(id))}/patientStatus/B`, {});
        return contract.ok({ data: r2, nextAction: "schedule_cancelled" });
      }
    }

    /**
     * =========================
     * ORDERS
     * =========================
     */

    // POST /orders (hub) -> POST /partners/order
    if (op === "order.create") {
      const r = await POST("/partners/order", data || {});
      return contract.ok({ data: r, nextAction: "order_created" });
    }

    // POST /orders/schedule?scheduleId= (hub) -> POST /partners/order/schedule?scheduleId=
    if (op === "order.fromSchedule") {
      const scheduleId = asId(data?.scheduleId ?? data?.id);
      if (!scheduleId) {
        return contract.fallback({
          message: "Certo. Para criar a ordem pela consulta, preciso do scheduleId.",
          nextAction: "ask_schedule_id",
        });
      }
      const r = await POST(`/partners/order/schedule?scheduleId=${encodeURIComponent(String(scheduleId))}`, {});
      return contract.ok({ data: r, nextAction: "order_created" });
    }

    // GET /orders/:id (hub) -> GET /partners/order/:id
    if (op === "order.get") {
      const orderId = asId(data?.orderId ?? data?.id);
      if (!orderId) {
        return contract.fallback({
          message: "Certo. Me informe o id da ordem (orderId).",
          nextAction: "ask_order_id",
        });
      }
      const r = await GET(`/partners/order/${encodeURIComponent(String(orderId))}`);
      return contract.ok({ data: r, nextAction: "order_loaded" });
    }

    // default
    return contract.error("Operação não suportada");
  } catch (err) {
    // DEBUG: se quiser, pode deixar details temporariamente
    console.error("RPC ENGINE ERROR:", err?.message || err);
    if (err?.response?.status) console.error("UPSTREAM STATUS:", err.response.status);
    if (err?.response?.data) console.error("UPSTREAM DATA:", err.response.data);
    if (err?.stack) console.error(err.stack);

    return {
      status: "error",
      message: "Instabilidade temporária",
      details: err?.response?.data || err?.message || String(err),
    };
  }
}
