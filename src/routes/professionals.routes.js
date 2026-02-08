// src/routes/professionals.routes.js
import express from "express";
import * as clinicallModule from "../clinicall/client.js";

const clinicall = clinicallModule.default ?? clinicallModule;
const router = express.Router();

/**
 * Monta payload paginado padrão do Clinicall:
 * { argument, page, sizePage, fieldSort, sortDirection }
 *
 * No Hub aceitamos:
 * - search (alias de argument)
 * - size (alias de sizePage)
 */
function buildPagedSearchPayload(input = {}) {
  const argument =
    (typeof input.argument === "string" ? input.argument : null) ??
    (typeof input.search === "string" ? input.search : null) ??
    "";

  const pageRaw = input.page ?? 0;
  const sizeRaw = input.sizePage ?? input.size ?? 25;

  const page = Number(pageRaw);
  const sizePage = Number(sizeRaw);

  const fieldSort = (input.fieldSort ?? "name").toString();
  const sortDirection = (input.sortDirection ?? "asc").toString().toLowerCase();

  return {
    argument,
    page: Number.isFinite(page) && page >= 0 ? page : 0,
    sizePage: Number.isFinite(sizePage) && sizePage > 0 && sizePage <= 100 ? sizePage : 25,
    fieldSort,
    sortDirection: sortDirection === "desc" ? "desc" : "asc",
  };
}

/**
 * POST /professionals/
 * -> Clinicall: POST /partners/performer/search
 *
 * Contrato real do Clinicall (doc):
 * { argument, page, sizePage, fieldSort, sortDirection }
 *
 * No Hub:
 * { search?, argument?, page?, sizePage?, size?, fieldSort?, sortDirection? }
 */
router.post("/", async (req, res, next) => {
  try {
    const payload = buildPagedSearchPayload(req.body ?? {});
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
 * No Hub aceitamos:
 * { performerId, doctorId?, date?, time?, started?, ...rest }
 *
 * Observação:
 * - performerId é obrigatório
 * - (P1) depois vamos exigir date range started/ended pra slots.
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
