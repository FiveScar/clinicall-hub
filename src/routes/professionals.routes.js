// src/routes/professionals.routes.js
import express from "express";
import * as clinicallModule from "../clinicall/client.js";

const clinicall = clinicallModule.default ?? clinicallModule;
const router = express.Router();

function toInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function buildPageSearch(input = {}) {
  // hub-friendly aliases
  const argument = (input.argument ?? input.search ?? "").toString();

  return {
    argument,
    page: toInt(input.page, 0),
    sizePage: toInt(input.sizePage, 25),
    fieldSort: (input.fieldSort ?? "name").toString(),
    sortDirection: (input.sortDirection ?? "asc").toString(),
  };
}

/**
 * POST /professionals/
 * -> Clinicall: POST /partners/performer/search
 *
 * Aceita:
 * { search, page, sizePage, fieldSort, sortDirection }
 *
 * (Se você quiser, pode aceitar também filtros extras no futuro,
 * mas P0 é bater 100% com a doc e parar de tomar validação aleatória)
 */
router.post("/", async (req, res, next) => {
  try {
    const bodyIn = req.body ?? {};
    const payload = buildPageSearch(bodyIn);

    const data = await clinicall.request("/partners/performer/search", {
      method: "POST",
      body: payload,
    });

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /professionals/schedule
 * -> Clinicall: POST /partners/schedule/v2/search
 *
 * Mantém como está, só exigindo performerId.
 * (Se vier vazio, é dado de agenda mesmo — não é bug do hub)
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

    const payload = { ...rest, performerId: resolvedPerformerId };

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
