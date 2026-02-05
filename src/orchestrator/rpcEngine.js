// src/orchestrator/rpcEngine.js
import clinicall from "../clinicall/client.js";
import * as contract from "./contract.js";

/**
 * Clinicall RPC Hub — RPC Engine
 * Objetivo: expor via /rpc TODOS os endpoints REST do hub (operações),
 * com chamadas reais para a Clinicall (via clinicall.request).
 *
 * REGRAS:
 * - NÃO existe busca por telefone na Clinicall -> NUNCA tratar 10/11 dígitos como telefone.
 * - Toda operação retorna contract.ok / contract.fallback / contract.error.
 */

function asNumberOrString(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && String(v).trim() !== "" ? n : String(v);
}

function buildSearchPayload(body = {}) {
  return {
    argument: body.argument ?? "",
    page: Number.isFinite(body.page) ? body.page : 0,
    sizePage: Number.isFinite(body.sizePage) ? body.sizePage : 25,
    fieldSort: body.fieldSort ?? "name",
    sortDirection: body.sortDirection ?? "asc",
  };
}

function buildSchedulePayload(input = {}) {
  const { patientId, doctorId, date, time, ...rest } = input;

  const normalized = {
    ...rest,
    patientId: patientId ?? rest.patientId,
    performerId: doctorId ?? rest.performerId,
  };

  // permite date+time -> started
  if (!normalized.started && date && time) {
    normalized.started = `${date}T${time}`;
  }

  return normalized;
}

function buildPatientPayload(input = {}) {
  const {
    id,
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
    ...(id != null ? { id } : {}),
    ...(name != null ? { name } : {}),
    ...(cpf != null ? { cpf } : {}),
    ...(birthDate != null
      ? { birthDate }
      : birthdate != null
      ? { birthDate: birthdate }
      : {}),
    // telefone pode existir no cadastro, mas NÃO é usado pra busca
    ...(phoneStandart != null
      ? { phoneStandart }
      : phone != null
      ? { phoneStandart: phone }
      : {}),
  };

  return payload;
}

async function post(path, body) {
  return clinicall.request(path, { method: "POST", body });
}
async function put(path, body) {
  return clinicall.request(path, { method: "PUT", body });
}
async function get(path) {
  return clinicall.request(path, { method: "GET" });
}
async function del(path) {
  return clinicall.request(path, { method: "DELETE" });
}

export async function runRPC(op, data = {}) {
  op = String(op || "").trim();

  try {
    /**
     * =========================
     * AUTH
     * =========================
     */

    // GET /auth/ping -> chama /partners/company (como seu REST faz)
    if (op === "auth.ping") {
      const r = await get("/partners/company");
      return contract.ok({ data: r, nextAction: "auth_ok" });
    }

    /**
     * =========================
     * COMPANIES
     * =========================
     */

    // GET /companies
    if (op === "companies.list") {
      const r = await get("/partners/company");
      return contract.ok({ data: r, nextAction: "companies_list" });
    }

    // GET /companies/:id
    if (op === "companies.get") {
      const id = asNumberOrString(data?.id ?? data?.companyId);
      if (!id) return contract.fallback({ message: "Certo. Me informe o id da empresa.", nextAction: "ask_company_id" });
      const r = await get(`/partners/company/${encodeURIComponent(String(id))}`);
      return contract.ok({ data: r, nextAction: "company_found" });
    }

    /**
     * =========================
     * PATIENTS
     * =========================
     */

    // POST /patients/search  (CPF ou nome — SEM telefone)
    if (op === "patient.search") {
      const payload = buildSearchPayload(data || {});
      if (!String(payload.argument || "").trim()) {
        return contract.fallback({
          message: "Perfeito. Me informe seu CPF (ou nome completo) para localizar seu cadastro.",
          nextAction: "ask_patient_identifier",
        });
      }

      const r = await post("/partners/patient/search", payload);
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

    // GET /patients/:id
    if (op === "patient.get") {
      const id = asNumberOrString(data?.id ?? data?.patientId);
      if (!id) return contract.fallback({ message: "Certo. Me informe o id do paciente.", nextAction: "ask_patient_id" });
      const r = await get(`/partners/patient/${encodeURIComponent(String(id))}`);
      return contract.ok({ data: r, nextAction: "patient_loaded" });
    }

    // POST /patients
    if (op === "patient.create") {
      const payload = buildPatientPayload(data || {});
      if (!payload?.name || !payload?.cpf) {
        return contract.fallback({
          message: "Perfeito. Para criar o cadastro, preciso do nome completo e CPF.",
          nextAction: "ask_patient_create_fields",
        });
      }

      const r = await post("/partners/patient", payload);
      return contract.ok({ data: r, nextAction: "patient_created" });
    }

    // PUT /patients/:id  (na Clinicall é PUT /partners/patient com id no body)
    if (op === "patient.update") {
      const id = asNumberOrString(data?.id ?? data?.patientId);
      if (!id) return contract.fallback({ message: "Certo. Me informe o id do paciente.", nextAction: "ask_patient_id" });

      const payload = buildPatientPayload({ ...(data || {}), id });
      const r = await put("/partners/patient", payload);
      return contract.ok({ data: r, nextAction: "patient_updated" });
    }

    // DELETE /patients/:id
    if (op === "patient.delete") {
      const id = asNumberOrString(data?.id ?? data?.patientId);
      if (!id) return contract.fallback({ message: "Certo. Me informe o id do paciente.", nextAction: "ask_patient_id" });

      const r = await del(`/partners/patient/${encodeURIComponent(String(id))}`);
      return contract.ok({ data: r, nextAction: "patient_deleted" });
    }

    // GET /patients/birthday/today-month/:day
    if (op === "patient.birthday.todayMonthDay") {
      const day = asNumberOrString(data?.day);
      if (!day) return contract.fallback({ message: "Certo. Me informe o dia (1–31).", nextAction: "ask_day" });

      const r = await get(`/partners/patient/birthday/today-month/${encodeURIComponent(String(day))}`);
      return contract.ok({ data: r, nextAction: "birthday_list" });
    }

    // GET /patients/birthday/today-month/:month/:day
    if (op === "patient.birthday.todayMonth") {
      const month = asNumberOrString(data?.month);
      const day = asNumberOrString(data?.day);
      if (!month || !day) {
        return contract.fallback({ message: "Certo. Me informe mês e dia (ex.: month=2, day=5).", nextAction: "ask_month_day" });
      }

      const r = await get(
        `/partners/patient/birthday/today-month/${encodeURIComponent(String(month))}/${encodeURIComponent(String(day))}`
      );
      return contract.ok({ data: r, nextAction: "birthday_list" });
    }

    /**
     * =========================
     * SPECIALITIES / PROFESSIONALS / PROCEDURES / INSURANCES
     * =========================
     */

    // POST /specialities/search
    if (op === "speciality.search") {
      const payload = buildSearchPayload(data || {});
      const r = await post("/partners/speciality/search", payload);
      return contract.ok({ data: r, nextAction: "specialities_list" });
    }

    // POST /professionals/search  (no hub você usa /partners/performer/search)
    if (op === "professional.search") {
      const payload = buildSearchPayload(data || {});
      // aceita specialityId opcional
      if (data?.specialityId != null) payload.specialityId = data.specialityId;
      if (data?.specialtyId != null) payload.specialityId = data.specialtyId;

      const r = await post("/partners/performer/search", payload);
      return contract.ok({ data: r, nextAction: "professionals_list" });
    }

    // POST /procedures/search
    if (op === "procedure.search") {
      const payload = buildSearchPayload(data || {});
      const r = await post("/partners/procedure/search", payload);
      return contract.ok({ data: r, nextAction: "procedures_list" });
    }

    // POST /insurances/search
    if (op === "insurance.search") {
      const payload = buildSearchPayload(data || {});
      const r = await post("/partners/insurance/search", payload);
      return contract.ok({ data: r, nextAction: "insurances_list" });
    }

    /**
     * =========================
     * SCHEDULES
     * =========================
     */

    // POST /schedules/search -> /partners/schedule/v2/search
    if (op === "schedule.search") {
      const payload = buildSchedulePayload(data || {});
      const r = await post("/partners/schedule/v2/search", payload);
      return contract.ok({ data: r, nextAction: "schedules_list" });
    }

    // POST /schedules (criar) -> /partners/schedule
    // aliases: schedule.create, schedule.book
    if (op === "schedule.create" || op === "schedule.book") {
      const payload = buildSchedulePayload(data || {});
      if (!payload?.patientId || !payload?.performerId || !payload?.started) {
        return contract.fallback({
          message: "Perfeito. Para marcar, preciso do paciente, do profissional e do horário.",
          nextAction: "ask_missing_booking_fields",
        });
      }
      const r = await post("/partners/schedule", payload);
      return contract.ok({ data: r, nextAction: "schedule_created" });
    }

    // PUT /schedules (atualizar/remarcar) -> /partners/schedule
    // aliases: schedule.update, schedule.reschedule
    if (op === "schedule.update" || op === "schedule.reschedule") {
      const payload = buildSchedulePayload(data || {});
      // a Clinicall normalmente exige id no body
      if (!payload?.id && !payload?.scheduleId) {
        return contract.fallback({
          message: "Certo. Para remarcar/atualizar, preciso do identificador da consulta.",
          nextAction: "ask_schedule_id",
        });
      }
      if (!payload.id && payload.scheduleId) payload.id = payload.scheduleId;

      const r = await put("/partners/schedule", payload);
      return contract.ok({ data: r, nextAction: "schedule_updated" });
    }

    // POST /schedules/:id/confirm -> /partners/scheduleConfirm (fallback /partners/:id/patientStatus/C)
    // alias: schedule.confirm
    if (op === "schedule.confirm") {
      const rawId = data?.id ?? data?.scheduleId;
      const id = asNumberOrString(rawId);
      if (!id) {
        return contract.fallback({
          message: "Certo. Para confirmar, preciso do identificador da consulta.",
          nextAction: "ask_schedule_id",
        });
      }

      try {
        const r = await post("/partners/scheduleConfirm", { scheduleId: id });
        return contract.ok({ data: r, nextAction: "schedule_confirmed" });
      } catch {
        const r2 = await post(`/partners/${encodeURIComponent(String(id))}/patientStatus/C`, undefined);
        return contract.ok({ data: r2, nextAction: "schedule_confirmed" });
      }
    }

    // POST /schedules/:id/cancel ou /schedules/cancel -> /partners/scheduleCancel (fallback /partners/:id/patientStatus/B)
    // alias: schedule.cancel
    if (op === "schedule.cancel") {
      const rawId = data?.scheduleId ?? data?.id;
      const id = asNumberOrString(rawId);
      if (!id) {
        return contract.fallback({
          message: "Certo. Para cancelar, preciso do identificador da consulta.",
          nextAction: "ask_schedule_id",
        });
      }

      try {
        const r = await post("/partners/scheduleCancel", { scheduleId: id });
        return contract.ok({ data: r, nextAction: "schedule_cancelled" });
      } catch {
        const r2 = await post(`/partners/${encodeURIComponent(String(id))}/patientStatus/B`, undefined);
        return contract.ok({ data: r2, nextAction: "schedule_cancelled" });
      }
    }

    /**
     * =========================
     * ORDERS
     * =========================
     */

    // POST /orders -> /partners/order
    if (op === "order.create") {
      const payload = data || {};
      const r = await post("/partners/order", payload);
      return contract.ok({ data: r, nextAction: "order_created" });
    }

    // POST /orders/schedule?scheduleId= -> /partners/order/schedule?scheduleId=
    if (op === "order.fromSchedule") {
      const scheduleId = asNumberOrString(data?.scheduleId ?? data?.id);
      if (!scheduleId) {
        return contract.fallback({
          message: "Certo. Para criar a ordem pela consulta, preciso do scheduleId.",
          nextAction: "ask_schedule_id",
        });
      }
      const r = await post(`/partners/order/schedule?scheduleId=${encodeURIComponent(String(scheduleId))}`, {});
      return contract.ok({ data: r, nextAction: "order_created" });
    }

    // GET /orders/:orderId -> /partners/order/:orderId
    if (op === "order.get") {
      const orderId = asNumberOrString(data?.orderId ?? data?.id);
      if (!orderId) {
        return contract.fallback({
          message: "Certo. Me informe o id da ordem (orderId).",
          nextAction: "ask_order_id",
        });
      }
      const r = await get(`/partners/order/${encodeURIComponent(String(orderId))}`);
      return contract.ok({ data: r, nextAction: "order_loaded" });
    }

    /**
     * =========================
     * INDEX (LOCAL DO HUB)
     * =========================
     * Estes endpoints são do próprio hub (não da Clinicall). Se você quiser 100% RPC,
     * a implementação aqui precisa chamar o serviço local do índice.
     *
     * Como o engine é executado dentro do hub, o ideal é importar o serviço do índice.
     * Se ainda não existir no seu repo, mantemos como "not supported" por enquanto.
     */

    if (op === "index.patients.status") {
      return contract.error("Operação não suportada: index.patients.status (implemente o serviço local do índice e conecte aqui)");
    }

    if (op === "index.patients.rebuild") {
      return contract.error("Operação não suportada: index.patients.rebuild (implemente o serviço local do índice e conecte aqui)");
    }

    /**
     * =========================
     * DEBUG
     * =========================
     */
    if (op === "debug.routes") {
      return contract.ok({ data: { hint: "Use GET /__routes" }, nextAction: "debug_hint" });
    }

    return contract.error("Operação não suportada");
  } catch (err) {
  console.error("RPC ENGINE ERROR:", err?.message || err);

  const details =
    err?.response?.data ||
    err?.data ||
    err?.message ||
    String(err);

  if (err?.response?.status) console.error("UPSTREAM STATUS:", err.response.status);
  if (err?.response?.data) console.error("UPSTREAM DATA:", err.response.data);
  if (err?.stack) console.error(err.stack);

  return {
    status: "error",
    message: "Instabilidade temporária",
    details,
  };
}