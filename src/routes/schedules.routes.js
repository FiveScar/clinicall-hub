// src/routes/schedules.routes.js
import express from "express";
import * as clinicallModule from "../clinicall/client.js";

const clinicall = clinicallModule.default ?? clinicallModule;
const router = express.Router();

/**
 * Helpers de resposta no padrão "tool"
 * (mantém consistência com /tool/health e /tool/patients/resolve)
 */
function toolOk(res, data, message = "ok") {
  return res.json({
    success: true,
    data,
    message,
    errors: [],
    trace_id: res.locals?.trace_id || undefined,
  });
}

function toolFail(res, httpStatus, error, details, extra = {}) {
  return res.status(httpStatus).json({
    success: false,
    data: null,
    message: error,
    errors: [
      {
        error,
        details,
        ...extra,
      },
    ],
    trace_id: res.locals?.trace_id || undefined,
  });
}

/**
 * Normaliza datas:
 * - Se vier "YYYY-MM-DD", usa como está
 * - Se vier vazio, não inventa
 */
function normalizeDateOnly(v) {
  if (!v) return null;
  const s = String(v).trim();
  // Aceita "YYYY-MM-DD" e "YYYY-MM-DDTHH:mm:ss"
  return s;
}

/**
 * Cria intervalo padrão se o agente não enviar:
 * - started: hoje
 * - ended: +7 dias
 */
function defaultDateRange(input = {}) {
  const started = normalizeDateOnly(input.started);
  const ended = normalizeDateOnly(input.ended);

  if (started && ended) return { started, ended };

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const s0 = `${yyyy}-${mm}-${dd}`;

  const plus7 = new Date(now);
  plus7.setDate(now.getDate() + 7);
  const yyyy2 = plus7.getFullYear();
  const mm2 = String(plus7.getMonth() + 1).padStart(2, "0");
  const dd2 = String(plus7.getDate()).padStart(2, "0");
  const s1 = `${yyyy2}-${mm2}-${dd2}`;

  return { started: started || s0, ended: ended || s1 };
}

/**
 * =========================================================
 * TOOL: buscar disponibilidade (slots) para agendar
 * =========================================================
 *
 * POST /tool/schedules/available
 * Body:
 * {
 *   companyId: 100000,
 *   performerId: 13,
 *   insuranceId: 3,
 *   procedureId: 14,
 *   started: "2026-02-10",
 *   ended: "2026-02-17"
 * }
 *
 * Upstream (Clinicall doc): POST /partners/schedule/search
 */
router.post("/available", async (req, res, next) => {
  try {
    const body = req.body ?? {};

    const companyId = body.companyId ?? null;
    const performerId = body.performerId ?? null;
    const insuranceId = body.insuranceId ?? null;
    const procedureId = body.procedureId ?? null;

    if (!companyId) {
      return toolFail(res, 400, "MISSING_FIELDS", "Informe companyId (id da unidade).", {
        required_fields: ["companyId"],
      });
    }
    if (!performerId) {
      return toolFail(res, 400, "MISSING_FIELDS", "Informe performerId (id do profissional).", {
        required_fields: ["performerId"],
      });
    }
    if (!procedureId) {
      return toolFail(res, 400, "MISSING_FIELDS", "Informe procedureId (id do procedimento).", {
        required_fields: ["procedureId"],
      });
    }
    // insuranceId pode ser obrigatório dependendo do cenário do cliente — aqui mantemos obrigatório
    if (!insuranceId) {
      return toolFail(res, 400, "MISSING_FIELDS", "Informe insuranceId (id do convênio).", {
        required_fields: ["insuranceId"],
      });
    }

    const { started, ended } = defaultDateRange(body);

    const upstreamPayload = {
      specialityId: body.specialityId ?? null,
      performerId,
      insuranceId,
      procedureId,
      companyId,
      status: body.status ?? null,
      patientStatus: body.patientStatus ?? null,
      started,
      ended,
    };

    const raw = await clinicall.request("/partners/schedule/search", {
      method: "POST",
      body: upstreamPayload,
    });

    // Padrão Clinicall: { code, message, details, data: [] }
    const list = raw?.data ?? [];

    // Tentativa pragmática de identificar slots livres:
    // - alguns tenants retornam agenda completa (ocupados e livres)
    // - livre normalmente vem sem patient OU com status/patientStatus específicos
    // Aqui filtramos "sem patient" como critério mínimo.
    const free = Array.isArray(list)
      ? list.filter((x) => x && (x.patient == null || x.patient?.id == null))
      : [];

    const slots = free.map((x) => {
      const scheduleId = x.id;
      const date = x.date ?? null;
      const time = x.hour ?? null;
      const label = date && time ? `${date} ${time}` : String(scheduleId);

      return {
        scheduleId,
        date,
        time,
        label,
        // opcional: carregar metadados úteis pro Hub/n8n
        companyId: x.company?.id ?? companyId,
        performerId: x.performer?.id ?? performerId,
        insuranceId: x.insurance?.id ?? insuranceId,
        procedureId: x.procedure?.id ?? procedureId,
        horaryId: x.horary?.id ?? null,
      };
    });

    if (!slots.length) {
      return toolOk(res, { status: "EMPTY", slots: [] }, "Nenhum horário disponível nesse período.");
    }

    return toolOk(res, { status: "FOUND", slots }, "ok");
  } catch (err) {
    next(err);
  }
});

/**
 * =========================================================
 * TOOL: agendar (book)
 * =========================================================
 *
 * POST /tool/schedules/book
 * Body:
 * {
 *   scheduleId: 123,
 *   patientId: 418,
 *   insuranceId: 3,
 *   procedureId: 14
 * }
 *
 * Upstream (Clinicall doc): PUT /partners/schedule
 * (scheduleId é obrigatório)
 */
router.post("/book", async (req, res, next) => {
  try {
    const body = req.body ?? {};

    const scheduleId = body.scheduleId ?? body.id ?? null;
    const patientId = body.patientId ?? null;
    const insuranceId = body.insuranceId ?? null;
    const procedureId = body.procedureId ?? null;

    const missing = [];
    if (!scheduleId) missing.push("scheduleId");
    if (!patientId) missing.push("patientId");
    if (!insuranceId) missing.push("insuranceId");
    if (!procedureId) missing.push("procedureId");

    if (missing.length) {
      return toolFail(
        res,
        400,
        "MISSING_FIELDS",
        `Campos obrigatórios ausentes: ${missing.join(", ")}.`,
        {
          required_fields: missing,
          example: { scheduleId: 123, patientId: 418, insuranceId: 3, procedureId: 14 },
        }
      );
    }

    // payload mínimo e seguro
    const upstreamPayload = {
      scheduleId,
      patientId,
      insuranceId,
      procedureId,
    };

    const raw = await clinicall.request("/partners/schedule", {
      method: "PUT",
      body: upstreamPayload,
    });

    return toolOk(res, { status: "BOOKED", upstream: raw }, "Agendamento realizado com sucesso.");
  } catch (err) {
    next(err);
  }
});

export default router;
