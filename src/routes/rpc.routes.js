// src/routes/rpc.routes.js
import express from "express";
import buildResponse from "../utils/buildResponse.js";

const router = express.Router();

/**
 * RPC OPS -> rotas internas do hub
 */
const OPS = {
  // schedules
  "schedule.search":  { method: "POST",   buildPath: () => "/schedules/search" },
  "schedule.create":  { method: "POST",   buildPath: () => "/schedules" },
  "schedule.update":  { method: "PUT",    buildPath: () => "/schedules" }, // reagendar/update via body
  "schedule.confirm": { method: "POST",   buildPath: (d) => `/schedules/${d.id}/confirm` },
  "schedule.cancel":  { method: "POST",   buildPath: (d) => `/schedules/${d.id}/cancel` },

  // patients
  "patient.search": { method: "POST",    buildPath: () => "/patients/search" },
  "patient.get":    { method: "GET",     buildPath: (d) => `/patients/${d.id}` },
  "patient.create": { method: "POST",    buildPath: () => "/patients" },
  "patient.update": { method: "PUT",     buildPath: (d) => `/patients/${d.id}` },
  "patient.delete": { method: "DELETE",  buildPath: (d) => `/patients/${d.id}` },

  // professionals
  "professional.search": { method: "POST", buildPath: () => "/professionals/search" },
  "professional.get":    { method: "GET",  buildPath: (d) => `/professionals/${d.id}` },

  // companies
  "company.list": { method: "GET", buildPath: () => "/companies" },
  "company.get":  { method: "GET", buildPath: (d) => `/companies/${d.id}` },

  // insurance / speciality / procedure (se você quiser usar no agente)
  "insurance.search":   { method: "POST", buildPath: () => "/insurances/search" },
  "speciality.search":  { method: "POST", buildPath: () => "/specialities/search" },
  "procedure.search":   { method: "POST", buildPath: () => "/procedures/search" },

  // status list
  "status.simpleList":  { method: "GET",  buildPath: (d) => `/schedules/status/${d.type}/simpleList` },
};

router.post("/", async (req, res, next) => {
  try {
    const { op, data = {} } = req.body || {};

    if (!op || !OPS[op]) {
      return res.status(400).json(
        buildResponse({
          ok: false,
          data: null,
          error: `Operação não suportada: ${op}`,
          meta: { code: "invalid_op" },
          requestId: req.requestId,
        })
      );
    }

    const def = OPS[op];
    const path = def.buildPath(data);

    // Re-dispatch interno no Express
    req.url = path;
    req.method = def.method;
    req.body = data;

    req.app.handle(req, res);
  } catch (err) {
    next(err);
  }
});

export default router;
