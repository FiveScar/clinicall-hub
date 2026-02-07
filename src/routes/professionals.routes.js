// src/routes/professionals.routes.js
import express from "express";
import * as clinicallModule from "../clinicall/client.js";

const clinicall = clinicallModule.default ?? clinicallModule;
const router = express.Router();

/**
 * POST /professionals/
 * Lista profissionais/médicos
 * -> Clinicall: POST /partners/performer/search
 *
 * Observação: o Clinicall pode exigir insuranceId (convênio) ou outros campos.
 * Aqui é passthrough + erro público já mapeado pelo client.js/app.js.
 */
router.post("/", async (req, res, next) => {
  try {
    const data = await clinicall.request("/partners/performer/search", {
      method: "POST",
      body: req.body,
    });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /professionals/schedule
 * Busca disponibilidade/agenda do profissional
 * -> Clinicall: POST /partners/schedule/v2/search
 *
 * Body esperado (hub-friendly):
 * {
 *   performerId: number,          // obrigatório
 *   companyId?: number,
 *   date?: "YYYY-MM-DD",          // opcional
 *   time?: "HH:mm",               // opcional
 *   started?: "YYYY-MM-DDTHH:mm"  // opcional (se já vier completo)
 *   ... outros filtros
 * }
 *
 * Se vier date+time, converte para started.
 */
router.post("/schedule", async (req, res, next) => {
  try {
    const input = req.body ?? {};
    const { performerId, doctorId, date, time, started, ...rest } = input;

    const resolvedPerformerId = performerId ?? doctorId ?? rest.performerId;

    if (!resolvedPerformerId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_FIELDS",
        details: "Informe performerId (id do profissional).",
      });
    }

    const payload = {
      ...rest,
      performerId: resolvedPerformerId,
    };

    // Normalização de started
    if (!payload.started && started) payload.started = started;
    if (!payload.started && date && time) payload.started = `${date}T${time}`;

    const data = await clinicall.request("/partners/schedule/v2/search", {
      method: "POST",
      body: payload,
    });

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
