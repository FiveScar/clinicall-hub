// src/routes/professionals.routes.js
import express from "express";
import * as clinicallModule from "../clinicall/client.js";

const clinicall = clinicallModule.default ?? clinicallModule;
const router = express.Router();

function isEmptyObject(obj) {
  return !obj || (typeof obj === "object" && Object.keys(obj).length === 0);
}

/**
 * POST /professionals/
 * Lista profissionais/médicos
 * -> Clinicall: POST /partners/performer/search
 *
 * Importante (BFF):
 * O Clinicall retorna 500 SYSTEM_EXCEPTION se o body vier vazio.
 * Então validamos aqui e devolvemos 400 com campos aceitos.
 */
router.post("/", async (req, res, next) => {
  try {
    const body = req.body ?? {};

    // Campos típicos usados por CRMs para filtrar profissional
    const allowed = ["companyId", "insuranceId", "specialityId", "procedureId", "name"];

    const hasAny =
      body.companyId != null ||
      body.insuranceId != null ||
      body.specialityId != null ||
      body.procedureId != null ||
      (typeof body.name === "string" && body.name.trim().length > 0);

    if (isEmptyObject(body) || !hasAny) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_FIELDS",
        details:
          "Envie pelo menos um filtro para buscar profissionais (evita erro 500 no sistema Clinicall).",
        required_fields_any_of: allowed,
        example: { companyId: 1, insuranceId: 1 },
      });
    }

    const data = await clinicall.request("/partners/performer/search", {
      method: "POST",
      body,
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
