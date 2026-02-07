// src/routes/tool.routes.js
import express from "express";
import { runRpc } from "../orchestrator/rpcEngine.js";

const router = express.Router();

function toolOk(req, res, { data = {}, message = "ok" } = {}) {
  return res.json({
    success: true,
    data,
    message,
    errors: [],
    trace_id: req.requestId,
  });
}

function toolErr(req, res, { http = 400, code = "BAD_REQUEST", message = "Erro", details = {} } = {}) {
  return res.status(http).json({
    success: false,
    data: {},
    message,
    errors: [{ code, message, details }],
    trace_id: req.requestId,
  });
}

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

    // 🔥 chama op existente do hub
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

export default router;
