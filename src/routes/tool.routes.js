// src/routes/tool.routes.js
import express from "express";
import { runRpc } from "../orchestrator/rpcEngine.js";

const router = express.Router();

/**
 * Tool API (BFF para o Agente)
 * - Contrato estável (success/data/message/errors/trace_id)
 * - Sem payloads complexos para o n8n/LLM
 * - Hub assume validações, defaults e orquestrações via RPC (rpcEngine)
 */

function toolOk(req, res, { data = {}, message = "ok" } = {}) {
  return res.json({
    success: true,
    data,
    message,
    errors: [],
    trace_id: req.requestId,
  });
}

function toolErr(
  req,
  res,
  {
    http = 400,
    code = "BAD_REQUEST",
    message = "Erro",
    details = {},
    required_fields = undefined,
    example = undefined,
  } = {}
) {
  const errObj = { code, message, details };
  if (Array.isArray(required_fields) && required_fields.length)
    errObj.required_fields = required_fields;
  if (example) errObj.example = example;

  return res.status(http).json({
    success: false,
    data: {},
    message,
    errors: [errObj],
    trace_id: req.requestId,
  });
}

/* =========================
 *  PATIENTS
 * ========================= */

function mapPatientSearchToResolve(rpcResp) {
  const nextAction = rpcResp?.nextAction || "";
  const data = rpcResp?.data || {};
  const options = Array.isArray(rpcResp?.options) ? rpcResp.options : [];

  if (nextAction === "need_name_for_cpf_search") {
    return {
      status: "MISSING_FIELDS",
      required_fields: ["name"],
      patient: null,
      options: [],
    };
  }

  if (nextAction === "patient_found_single" && data?.id) {
    return {
      status: "FOUND",
      patient: { id: data.id, label: data.label || null },
      options: [],
    };
  }

  if (nextAction === "choose_patient" && options.length) {
    return {
      status: "AMBIGUOUS",
      patient: null,
      options,
    };
  }

  if (nextAction === "patient_not_found") {
    return {
      status: "NOT_FOUND",
      patient: null,
      options: [],
    };
  }

  return {
    status: "UNKNOWN",
    patient: null,
    options,
  };
}

router.get("/health", (req, res) => {
  return toolOk(req, res, {
    data: { ok: true, service: "clinicall-hub-tool" },
    message: "ok",
  });
});

/**
 * POST /tool/patients/resolve
 * Body:
 *  - cpf? (string) -> aceita com máscara
 *  - name? (string)
 *
 * Retorno:
 *  - status: FOUND | AMBIGUOUS | NOT_FOUND | MISSING_FIELDS | UNKNOWN
 *  - patient: {id,label} | null
 *  - options: [{id,label}] (quando AMBIGUOUS)
 */
router.post("/patients/resolve", async (req, res) => {
  try {
    const cpfRaw = String(req.body?.cpf ?? "").trim();
    const name = String(req.body?.name ?? "").trim();
    const cpfDigits = cpfRaw.replace(/\D+/g, "");

    if (!cpfDigits && !name) {
      return toolErr(req, res, {
        http: 400,
        code: "MISSING_FIELDS",
        message: "Informe CPF ou nome completo.",
        details: { required_fields: ["cpf|name"] },
      });
    }

    if (cpfDigits && cpfDigits.length !== 11) {
      return toolErr(req, res, {
        http: 400,
        code: "INVALID_CPF",
        message: "CPF inválido.",
        details: { cpf: cpfRaw },
      });
    }

    if (cpfDigits && !name) {
      return toolOk(req, res, {
        data: {
          status: "MISSING_FIELDS",
          required_fields: ["name"],
          patient: null,
          options: [],
        },
        message: "Para localizar com segurança, informe o nome completo junto do CPF.",
      });
    }

    // chama op existente do hub
    const rpcResp = await runRpc({
      op: "patient.search",
      data: cpfDigits ? { argument: cpfDigits, name } : { argument: name },
    });

    if (rpcResp?.status === "error") {
      return toolErr(req, res, {
        http: 502,
        code: "UPSTREAM_ORCHESTRATION_ERROR",
        message: rpcResp?.message || "Falha ao consultar CRM.",
        details: { rpc: rpcResp },
      });
    }

    const mapped = mapPatientSearchToResolve(rpcResp);

    return toolOk(req, res, {
      data: mapped,
      message: rpcResp?.message || "ok",
    });
  } catch (err) {
    return toolErr(req, res, {
      http: 500,
      code: "INTERNAL_ERROR",
      message: "Erro interno no Hub.",
      details: { error: err?.message || String(err) },
    });
  }
});

/* =========================
 *  SCHEDULES (AGENDA)
 * ========================= */

function mapFreeSlots(rpcResp) {
  const nextAction = rpcResp?.nextAction || "";
  const slots = Array.isArray(rpcResp?.data) ? rpcResp.data : [];
  const options = Array.isArray(rpcResp?.options) ? rpcResp.options : [];

  if (nextAction === "no_free_slots") {
    return { status: "NO_SLOTS", slots: [], options: [] };
  }

  if (nextAction === "free_slots_found") {
    return { status: "FOUND", slots, options };
  }

  // fallback: se vier slots sem nextAction, ainda devolve
  if (slots.length) return { status: "FOUND", slots, options };

  return { status: "UNKNOWN", slots: [], options };
}

/**
 * POST /tool/schedules/available
 * Body:
 *  - performerId? (number) OU specialityId? (number)  [obrigatório ao menos 1]
 *  - companyId? (number)            (default no RPC)
 *  - insuranceId? (number)          (default no RPC)
 *  - procedureId? (number)          (default no RPC)
 *  - started? "YYYY-MM-DD"          (default hoje)
 *  - ended?   "YYYY-MM-DD"          (default hoje + N dias)
 *  - maxSlots? number               (default no RPC)
 *
 * Retorno:
 *  - status: FOUND | NO_SLOTS | UNKNOWN
 *  - slots: [{scheduleId,date,hour,performer,performerId,speciality,specialityId,company,companyId}]
 *  - options: [{id,label}]  (pronto para o agente perguntar "qual prefere?")
 */
router.post("/schedules/available", async (req, res) => {
  try {
    const performerId = req.body?.performerId;
    const specialityId = req.body?.specialityId;

    if (!performerId && !specialityId) {
      return toolErr(req, res, {
        http: 400,
        code: "MISSING_FIELDS",
        message:
          "Informe performerId (id do profissional) ou specialityId (id da especialidade).",
        details: { required_fields: ["performerId|specialityId"] },
        required_fields: ["performerId|specialityId"],
        example: {
          performerId: 13,
          companyId: 100000,
          insuranceId: 3,
          procedureId: 14,
          started: "2026-02-10",
          ended: "2026-02-17",
          maxSlots: 30,
        },
      });
    }

    const rpcResp = await runRpc({
      op: "schedule.findFreeSlots",
      data: {
        performerId,
        specialityId,
        companyId: req.body?.companyId,
        insuranceId: req.body?.insuranceId,
        procedureId: req.body?.procedureId,
        started: req.body?.started,
        ended: req.body?.ended,
        maxSlots: req.body?.maxSlots,
        performerName: req.body?.performerName,
        specialityName: req.body?.specialityName,
        companyName: req.body?.companyName,
      },
    });

    if (rpcResp?.status === "error") {
      return toolErr(req, res, {
        http: 502,
        code: "UPSTREAM_ORCHESTRATION_ERROR",
        message: rpcResp?.message || "Falha ao consultar agenda no CRM.",
        details: { rpc: rpcResp },
      });
    }

    const mapped = mapFreeSlots(rpcResp);

    return toolOk(req, res, {
      data: mapped,
      message: rpcResp?.message || "ok",
    });
  } catch (err) {
    return toolErr(req, res, {
      http: 500,
      code: "INTERNAL_ERROR",
      message: "Erro interno no Hub ao buscar disponibilidade.",
      details: { error: err?.message || String(err) },
    });
  }
});

/**
 * POST /tool/schedules/book
 * Body:
 *  - scheduleId (number)  [obrigatório]
 *  - patientId  (number)  [obrigatório]
 *  - insuranceId (number) [obrigatório]
 *  - procedureId (number) [obrigatório]
 *  - confirm? (boolean)   [default true] -> usa schedule.bookAndConfirm
 *
 * Retorno:
 *  - status: BOOKED | BOOKED_CONFIRMED
 *  - result: payload do CRM (booked/confirmed quando aplicável)
 */
router.post("/schedules/book", async (req, res) => {
  try {
    const scheduleId = req.body?.scheduleId;
    const patientId = req.body?.patientId;
    const insuranceId = req.body?.insuranceId;
    const procedureId = req.body?.procedureId;
    const confirm = req.body?.confirm ?? true;

    const missing = [];
    if (!scheduleId) missing.push("scheduleId");
    if (!patientId) missing.push("patientId");
    if (!insuranceId) missing.push("insuranceId");
    if (!procedureId) missing.push("procedureId");

    if (missing.length) {
      return toolErr(req, res, {
        http: 400,
        code: "MISSING_FIELDS",
        message: "Campos obrigatórios ausentes para agendar.",
        details: { required_fields: missing },
        required_fields: missing,
        example: {
          scheduleId: 123,
          patientId: 418,
          insuranceId: 3,
          procedureId: 14,
          confirm: true,
        },
      });
    }

    const rpcResp = await runRpc({
      op: confirm ? "schedule.bookAndConfirm" : "schedule.book",
      data: { scheduleId, patientId, insuranceId, procedureId },
    });

    if (rpcResp?.status === "error") {
      return toolErr(req, res, {
        http: 502,
        code: "UPSTREAM_ORCHESTRATION_ERROR",
        message: rpcResp?.message || "Falha ao agendar no CRM.",
        details: { rpc: rpcResp },
      });
    }

    return toolOk(req, res, {
      data: {
        status: confirm ? "BOOKED_CONFIRMED" : "BOOKED",
        result: rpcResp?.data ?? rpcResp,
      },
      message: rpcResp?.message || "ok",
    });
  } catch (err) {
    return toolErr(req, res, {
      http: 500,
      code: "INTERNAL_ERROR",
      message: "Erro interno no Hub ao agendar.",
      details: { error: err?.message || String(err) },
    });
  }
});

/**
 * POST /tool/schedules/confirm
 * Body:
 *  - scheduleId (number) [obrigatório]
 */
router.post("/schedules/confirm", async (req, res) => {
  try {
    const scheduleId = req.body?.scheduleId ?? req.body?.id;

    if (!scheduleId) {
      return toolErr(req, res, {
        http: 400,
        code: "MISSING_FIELDS",
        message: "Informe scheduleId para confirmar.",
        details: { required_fields: ["scheduleId"] },
        required_fields: ["scheduleId"],
        example: { scheduleId: 123 },
      });
    }

    const rpcResp = await runRpc({
      op: "schedule.confirm",
      data: { scheduleId },
    });

    if (rpcResp?.status === "error") {
      return toolErr(req, res, {
        http: 502,
        code: "UPSTREAM_ORCHESTRATION_ERROR",
        message: rpcResp?.message || "Falha ao confirmar no CRM.",
        details: { rpc: rpcResp },
      });
    }

    return toolOk(req, res, {
      data: { status: "CONFIRMED", result: rpcResp?.data ?? rpcResp },
      message: rpcResp?.message || "ok",
    });
  } catch (err) {
    return toolErr(req, res, {
      http: 500,
      code: "INTERNAL_ERROR",
      message: "Erro interno no Hub ao confirmar.",
      details: { error: err?.message || String(err) },
    });
  }
});

/**
 * POST /tool/schedules/cancel
 * Body:
 *  - scheduleId (number) [obrigatório]
 *  - reason? (string)    [opcional - apenas log/telemetria, CRM não suporta nativamente aqui]
 */
router.post("/schedules/cancel", async (req, res) => {
  try {
    const scheduleId = req.body?.scheduleId ?? req.body?.id;
    const reason = String(req.body?.reason ?? "").trim();

    if (!scheduleId) {
      return toolErr(req, res, {
        http: 400,
        code: "MISSING_FIELDS",
        message: "Informe scheduleId para cancelar.",
        details: { required_fields: ["scheduleId"] },
        required_fields: ["scheduleId"],
        example: { scheduleId: 123, reason: "Não posso comparecer" },
      });
    }

    const rpcResp = await runRpc({
      op: "schedule.cancel",
      data: { scheduleId },
    });

    if (rpcResp?.status === "error") {
      return toolErr(req, res, {
        http: 502,
        code: "UPSTREAM_ORCHESTRATION_ERROR",
        message: rpcResp?.message || "Falha ao cancelar no CRM.",
        details: { rpc: rpcResp, reason },
      });
    }

    return toolOk(req, res, {
      data: { status: "CANCELLED", result: rpcResp?.data ?? rpcResp },
      message: rpcResp?.message || "ok",
    });
  } catch (err) {
    return toolErr(req, res, {
      http: 500,
      code: "INTERNAL_ERROR",
      message: "Erro interno no Hub ao cancelar.",
      details: { error: err?.message || String(err) },
    });
  }
});

/**
 * POST /tool/schedules/reschedule
 * Body:
 *  - oldScheduleId (number) [obrigatório]
 *  - newScheduleId (number) [obrigatório]
 *  - patientId (number)     [obrigatório]
 *  - insuranceId (number)   [obrigatório]
 *  - procedureId (number)   [obrigatório]
 */
router.post("/schedules/reschedule", async (req, res) => {
  try {
    const oldScheduleId = req.body?.oldScheduleId ?? req.body?.currentScheduleId;
    const newScheduleId = req.body?.newScheduleId ?? req.body?.scheduleId;
    const patientId = req.body?.patientId;
    const insuranceId = req.body?.insuranceId;
    const procedureId = req.body?.procedureId;

    const missing = [];
    if (!oldScheduleId) missing.push("oldScheduleId");
    if (!newScheduleId) missing.push("newScheduleId");
    if (!patientId) missing.push("patientId");
    if (!insuranceId) missing.push("insuranceId");
    if (!procedureId) missing.push("procedureId");

    if (missing.length) {
      return toolErr(req, res, {
        http: 400,
        code: "MISSING_FIELDS",
        message: "Campos obrigatórios ausentes para remarcar.",
        details: { required_fields: missing },
        required_fields: missing,
        example: {
          oldScheduleId: 111,
          newScheduleId: 222,
          patientId: 418,
          insuranceId: 3,
          procedureId: 14,
        },
      });
    }

    const rpcResp = await runRpc({
      op: "schedule.reschedule",
      data: { oldScheduleId, newScheduleId, patientId, insuranceId, procedureId },
    });

    if (rpcResp?.status === "error") {
      return toolErr(req, res, {
        http: 502,
        code: "UPSTREAM_ORCHESTRATION_ERROR",
        message: rpcResp?.message || "Falha ao remarcar no CRM.",
        details: { rpc: rpcResp },
      });
    }

    return toolOk(req, res, {
      data: { status: "RESCHEDULED", result: rpcResp?.data ?? rpcResp },
      message: rpcResp?.message || "ok",
    });
  } catch (err) {
    return toolErr(req, res, {
      http: 500,
      code: "INTERNAL_ERROR",
      message: "Erro interno no Hub ao remarcar.",
      details: { error: err?.message || String(err) },
    });
  }
});

export default router;
