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
 *  HELPERS
 * ========================= */

function toIntOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toBool(v, def = false) {
  if (v === null || v === undefined) return def;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return ["true", "1", "yes", "y"].includes(v.toLowerCase());
  if (typeof v === "number") return v === 1;
  return def;
}

function todayISO() {
  // Mantém simples: YYYY-MM-DD (UTC). Se quiser "America/Sao_Paulo", faz isso no RPC.
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysISO(iso, days) {
  // iso: YYYY-MM-DD
  const [y, m, d] = String(iso).split("-").map((x) => Number(x));
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function safeString(v) {
  return String(v ?? "").trim();
}

function extractUpstreamErrorInfo(rpcResp) {
  // rpcResp esperado (pelo que você mostrou): {status:"error", message:"...", details:{code,message,errorCode...}}
  const details = rpcResp?.details || rpcResp?.data?.details || {};
  const deep = rpcResp?.details?.details || {};
  const msg =
    safeString(details?.message) ||
    safeString(deep?.message) ||
    safeString(rpcResp?.message);

  const errorCode =
    details?.errorCode ||
    deep?.errorCode ||
    rpcResp?.details?.errorCode ||
    null;

  const code =
    safeString(details?.code) ||
    safeString(deep?.code) ||
    safeString(rpcResp?.code) ||
    "";

  return { msg, errorCode, code, details };
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
    const cpfRaw = safeString(req.body?.cpf);
    const name = safeString(req.body?.name);
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

    const rpcResp = await runRpc({
      op: "patient.search",
      data: cpfDigits ? { argument: cpfDigits, name } : { argument: name },
    });

    if (rpcResp?.status === "error") {
      return toolErr(req, res, {
        http: 502,
        code: "UPSTREAM_ORCHESTRATION_ERROR",
        message: "Não consegui concluir a busca agora. Podemos tentar novamente?",
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

  if (slots.length) return { status: "FOUND", slots, options };

  return { status: "UNKNOWN", slots: [], options };
}

function pickTopN(mapped, n) {
  const N = Number(n || 0);
  if (!N || N <= 0) return mapped;

  const slots = Array.isArray(mapped?.slots) ? mapped.slots.slice(0, N) : [];
  const options = Array.isArray(mapped?.options) ? mapped.options.slice(0, N) : [];
  return { ...mapped, slots, options };
}

async function findFreeSlotsWithExpansion(payload) {
  // payload = { performerId, specialityId, companyId, insuranceId, procedureId, started, ended, maxSlots, ... }
  // Expansão: se vazio, aumenta o "ended" em passos.
  const started = payload.started || todayISO();
  const initialEnded = payload.ended || addDaysISO(started, 7);

  const expandIfEmpty = toBool(payload.expandIfEmpty, true);
  const expandStepDays = toIntOrNull(payload.expandStepDays) ?? 7;
  const maxLookaheadDays = toIntOrNull(payload.maxLookaheadDays) ?? 90;

  // quantas tentativas no máximo, dado o maxLookaheadDays
  const hardMaxTries = Math.max(1, Math.ceil(maxLookaheadDays / Math.max(1, expandStepDays)));

  let tries = 0;
  let currentEnded = initialEnded;
  let lastRpc = null;
  let lastMapped = null;

  while (tries < hardMaxTries) {
    tries += 1;

    const rpcResp = await runRpc({
      op: "schedule.findFreeSlots",
      data: {
        performerId: payload.performerId,
        specialityId: payload.specialityId,
        companyId: payload.companyId,
        insuranceId: payload.insuranceId,
        procedureId: payload.procedureId,
        started,
        ended: currentEnded,
        maxSlots: payload.maxSlots,
        performerName: payload.performerName,
        specialityName: payload.specialityName,
        companyName: payload.companyName,
      },
    });

    lastRpc = rpcResp;

    if (rpcResp?.status === "error") {
      return { rpcResp, mapped: null, meta: { tries, started, ended: currentEnded } };
    }

    const mapped = mapFreeSlots(rpcResp);
    lastMapped = mapped;

    if (mapped.status === "FOUND") {
      return {
        rpcResp,
        mapped,
        meta: { tries, started, ended: currentEnded, expanded: tries > 1 },
      };
    }

    if (!expandIfEmpty) {
      return {
        rpcResp,
        mapped,
        meta: { tries, started, ended: currentEnded, expanded: false },
      };
    }

    // Expande a janela
    currentEnded = addDaysISO(currentEnded, expandStepDays);
  }

  // Se estourou tentativas, devolve o último "NO_SLOTS/UNKNOWN"
  return {
    rpcResp: lastRpc,
    mapped: lastMapped || { status: "NO_SLOTS", slots: [], options: [] },
    meta: { tries, started, ended: currentEnded, expanded: true, maxed: true },
  };
}

/**
 * POST /tool/schedules/available
 * Body:
 *  - performerId? (number) OU specialityId? (number)  [obrigatório ao menos 1]
 *  - companyId? (number)            (default no RPC)
 *  - insuranceId? (number)          (default no RPC)
 *  - procedureId? (number)          (default no RPC)
 *  - started? "YYYY-MM-DD"          (default hoje)
 *  - ended?   "YYYY-MM-DD"          (default hoje + 7 dias)
 *  - maxSlots? number               (default no RPC)
 *
 *  + NOVO (ANTI-LOOP):
 *  - offerCount? number             (default 3) -> devolve só os N primeiros horários
 *  - expandIfEmpty? boolean         (default true) -> expande a busca se não houver horários
 *  - expandStepDays? number         (default 7)
 *  - maxLookaheadDays? number       (default 90)
 *
 * Retorno:
 *  - status: FOUND | NO_SLOTS | UNKNOWN
 *  - slots: [...]
 *  - options: [{id,label}]
 *  - meta: {started, ended, tries, expanded, maxed}
 */
router.post("/schedules/available", async (req, res) => {
  try {
    const performerId = toIntOrNull(req.body?.performerId);
    const specialityId = toIntOrNull(req.body?.specialityId);

    if (!performerId && !specialityId) {
      return toolErr(req, res, {
        http: 400,
        code: "MISSING_FIELDS",
        message: "Informe performerId (id do profissional) ou specialityId (id da especialidade).",
        details: { required_fields: ["performerId|specialityId"] },
        required_fields: ["performerId|specialityId"],
        example: {
          performerId: 13,
          companyId: 100000,
          insuranceId: 3,
          procedureId: 14,
          started: "2026-02-10",
          ended: "2026-02-17",
          offerCount: 3,
          expandIfEmpty: true,
          expandStepDays: 7,
          maxLookaheadDays: 90,
        },
      });
    }

    const offerCount = toIntOrNull(req.body?.offerCount) ?? 3;

    const { rpcResp, mapped, meta } = await findFreeSlotsWithExpansion({
      performerId,
      specialityId,
      companyId: toIntOrNull(req.body?.companyId),
      insuranceId: toIntOrNull(req.body?.insuranceId),
      procedureId: toIntOrNull(req.body?.procedureId),
      started: safeString(req.body?.started) || undefined,
      ended: safeString(req.body?.ended) || undefined,
      maxSlots: toIntOrNull(req.body?.maxSlots),
      performerName: safeString(req.body?.performerName) || undefined,
      specialityName: safeString(req.body?.specialityName) || undefined,
      companyName: safeString(req.body?.companyName) || undefined,
      expandIfEmpty: req.body?.expandIfEmpty,
      expandStepDays: req.body?.expandStepDays,
      maxLookaheadDays: req.body?.maxLookaheadDays,
    });

    if (rpcResp?.status === "error") {
      return toolErr(req, res, {
        http: 502,
        code: "UPSTREAM_ORCHESTRATION_ERROR",
        message: "Não consegui consultar a agenda agora. Podemos tentar de novo?",
        details: { rpc: rpcResp },
      });
    }

    const trimmed = pickTopN(mapped, offerCount);

    // Mensagens mais “assistente-like”, mas ainda neutras (LLM humaniza por cima)
    let msg = rpcResp?.message || "ok";
    if (trimmed.status === "FOUND") {
      const count = trimmed.options?.length || trimmed.slots?.length || 0;
      msg = count
        ? `Encontrei ${count} horário(s) disponível(is).`
        : "Encontrei horários disponíveis.";
    } else if (trimmed.status === "NO_SLOTS") {
      msg = `Não há horários disponíveis de ${meta.started} a ${meta.ended}. Posso buscar em outro período.`;
    }

    return toolOk(req, res, {
      data: { ...trimmed, meta },
      message: msg,
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
 *  + NOVO (ANTI-LOOP / CONFLITO):
 *  - searchContext? (object) -> se o horário escolhido estiver ocupado, o hub já devolve novas opções
 *    Ex:
 *    {
 *      "performerId": 29,
 *      "companyId": 100000,
 *      "insuranceId": 3,
 *      "procedureId": 14,
 *      "started": "2026-02-10",
 *      "ended": "2026-02-17",
 *      "offerCount": 3,
 *      "expandIfEmpty": true,
 *      "expandStepDays": 7,
 *      "maxLookaheadDays": 90
 *    }
 */
router.post("/schedules/book", async (req, res) => {
  try {
    const scheduleId = toIntOrNull(req.body?.scheduleId);
    const patientId = toIntOrNull(req.body?.patientId);
    const insuranceId = toIntOrNull(req.body?.insuranceId);
    const procedureId = toIntOrNull(req.body?.procedureId);
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
          scheduleId: 781661,
          patientId: 418,
          insuranceId: 3,
          procedureId: 14,
          confirm: true,
          searchContext: {
            performerId: 29,
            companyId: 100000,
            insuranceId: 3,
            procedureId: 14,
            started: "2026-02-10",
            ended: "2026-02-17",
            offerCount: 3,
          },
        },
      });
    }

    const rpcResp = await runRpc({
      op: confirm ? "schedule.bookAndConfirm" : "schedule.book",
      data: { scheduleId, patientId, insuranceId, procedureId },
    });

    if (rpcResp?.status === "error") {
      const { msg, errorCode } = extractUpstreamErrorInfo(rpcResp);

      // Caso clássico do seu teste: "Horário já está ocupado!"
      if (msg.toLowerCase().includes("horário já está ocupado") || msg.toLowerCase().includes("horario ja esta ocupado")) {
        const searchContext = req.body?.searchContext || null;

        let refresh = null;
        if (searchContext && (searchContext.performerId || searchContext.specialityId)) {
          const offerCount = toIntOrNull(searchContext.offerCount) ?? 3;

          const { rpcResp: refreshRpc, mapped, meta } = await findFreeSlotsWithExpansion({
            performerId: toIntOrNull(searchContext.performerId),
            specialityId: toIntOrNull(searchContext.specialityId),
            companyId: toIntOrNull(searchContext.companyId),
            insuranceId: toIntOrNull(searchContext.insuranceId),
            procedureId: toIntOrNull(searchContext.procedureId),
            started: safeString(searchContext.started) || undefined,
            ended: safeString(searchContext.ended) || undefined,
            maxSlots: toIntOrNull(searchContext.maxSlots),
            performerName: safeString(searchContext.performerName) || undefined,
            specialityName: safeString(searchContext.specialityName) || undefined,
            companyName: safeString(searchContext.companyName) || undefined,
            expandIfEmpty: searchContext.expandIfEmpty,
            expandStepDays: searchContext.expandStepDays,
            maxLookaheadDays: searchContext.maxLookaheadDays,
          });

          if (refreshRpc?.status !== "error" && mapped) {
            refresh = { ...pickTopN(mapped, offerCount), meta };
          }
        }

        return toolErr(req, res, {
          http: 409,
          code: "SLOT_OCCUPIED",
          message: "Esse horário acabou de ser preenchido. Posso te sugerir outros horários?",
          details: {
            errorCode,
            refresh, // se existir, o agente já recebe slots/options novos aqui
            rpc: rpcResp,
          },
        });
      }

      // Qualquer outro erro do CRM/orquestração:
      return toolErr(req, res, {
        http: 502,
        code: "UPSTREAM_ORCHESTRATION_ERROR",
        message: "Não consegui concluir o agendamento agora. Podemos tentar novamente?",
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
    const scheduleId = toIntOrNull(req.body?.scheduleId ?? req.body?.id);

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
        message: "Não consegui confirmar agora. Podemos tentar novamente?",
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
    const scheduleId = toIntOrNull(req.body?.scheduleId ?? req.body?.id);
    const reason = safeString(req.body?.reason);

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
        message: "Não consegui concluir o cancelamento agora. Podemos tentar novamente?",
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
    const oldScheduleId = toIntOrNull(req.body?.oldScheduleId ?? req.body?.currentScheduleId);
    const newScheduleId = toIntOrNull(req.body?.newScheduleId ?? req.body?.scheduleId);
    const patientId = toIntOrNull(req.body?.patientId);
    const insuranceId = toIntOrNull(req.body?.insuranceId);
    const procedureId = toIntOrNull(req.body?.procedureId);

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
        message: "Não consegui concluir a remarcação agora. Podemos tentar novamente?",
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
