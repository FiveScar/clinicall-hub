// src/routes/rpc.routes.js
import express from "express";

const router = express.Router();

/**
 * Tabela de operações suportadas.
 * Cada op mapeia para:
 *   method
 *   path builder
 */
const OPS = {
  // schedules
  "schedule.confirm": {
    method: "POST",
    buildPath: (d) => `/schedules/${d.id}/confirm`,
  },
  "schedule.cancel": {
    method: "POST",
    buildPath: (d) => `/schedules/${d.id}/cancel`,
  },
  "schedule.search": {
    method: "POST",
    buildPath: () => `/schedules/search`,
  },

  // patients
  "patient.search": {
    method: "POST",
    buildPath: () => `/patients/search`,
  },
  "patient.get": {
    method: "GET",
    buildPath: (d) => `/patients/${d.id}`,
  },
  "patient.create": {
    method: "POST",
    buildPath: () => `/patients`,
  },
  "patient.update": {
    method: "PUT",
    buildPath: (d) => `/patients/${d.id}`,
  },
  "patient.delete": {
    method: "DELETE",
    buildPath: (d) => `/patients/${d.id}`,
  },

  // companies
  "company.list": {
    method: "GET",
    buildPath: () => `/companies`,
  },
  "company.get": {
    method: "GET",
    buildPath: (d) => `/companies/${d.id}`,
  },
};

router.post("/", async (req, res, next) => {
  try {
    const { op, data = {} } = req.body || {};

    if (!op || !OPS[op]) {
      return res.status(400).json({
        ok: false,
        error: "invalid_op",
        details: `Operação não suportada: ${op}`,
      });
    }

    const def = OPS[op];
    const path = def.buildPath(data);

    // reutiliza o próprio Express internamente
    const method = def.method.toLowerCase();

    req.url = path;
    req.method = def.method;
    req.body = data;

    // re-dispatch interno
    req.app.handle(req, res);
  } catch (err) {
    next(err);
  }
});

export default router;
