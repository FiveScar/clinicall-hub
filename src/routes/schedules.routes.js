// src/routes/schedules.routes.js
import express from "express";
import clinicall from "../clinicall/client.js";
import { ok } from "../utils/response.js";

const router = express.Router();

/**
 * SEARCH (agenda / agendamentos)
 * Upstream: POST /partners/schedule/v2/search
 */
router.post("/search", async (req, res, next) => {
  try {
    const data = await clinicall.request("/partners/schedule/v2/search", {
      method: "POST",
      body: req.body,
    });
    ok(res, req, data);
  } catch (err) {
    next(err);
  }
});

/**
 * CREATE (criar agendamento)
 * Upstream: POST /partners/schedule
 */
router.post("/", async (req, res, next) => {
  try {
    const data = await clinicall.request("/partners/schedule", {
      method: "POST",
      body: req.body,
    });
    ok(res, req, data);
  } catch (err) {
    next(err);
  }
});

/**
 * UPDATE / RESCHEDULE (reagendar / atualizar)
 * Upstream: PUT /partners/schedule
 *
 * Observação:
 * - Clinicall costuma receber o "id" no body (ex: { id: 123, started: ..., ended: ... })
 * - Por isso usamos PUT no collection.
 */
router.put("/", async (req, res, next) => {
  try {
    const data = await clinicall.request("/partners/schedule", {
      method: "PUT",
      body: req.body,
    });
    ok(res, req, data);
  } catch (err) {
    next(err);
  }
});

/**
 * CONFIRM (confirmar presença)
 * Preferência:
 * - POST /partners/scheduleConfirm  body: { scheduleId }
 * Fallback:
 * - POST /partners/:id/patientStatus/C
 */
router.post("/:id/confirm", async (req, res, next) => {
  try {
    const { id } = req.params;

    try {
      const data = await clinicall.request("/partners/scheduleConfirm", {
        method: "POST",
        body: { scheduleId: Number(id) || id },
      });
      return ok(res, req, data);
    } catch (_e) {
      // fallback antigo
      const data = await clinicall.request(`/partners/${id}/patientStatus/C`, {
        method: "POST",
      });
      return ok(res, req, data);
    }
  } catch (err) {
    next(err);
  }
});

/**
 * CANCEL (cancelar)
 * Preferência:
 * - POST /partners/scheduleCancel  body: { scheduleId }
 * Fallback:
 * - POST /partners/:id/patientStatus/B
 */
router.post("/:id/cancel", async (req, res, next) => {
  try {
    const { id } = req.params;

    try {
      const data = await clinicall.request("/partners/scheduleCancel", {
        method: "POST",
        body: { scheduleId: Number(id) || id },
      });
      return ok(res, req, data);
    } catch (_e) {
      // fallback antigo
      const data = await clinicall.request(`/partners/${id}/patientStatus/B`, {
        method: "POST",
      });
      return ok(res, req, data);
    }
  } catch (err) {
    next(err);
  }
});

/**
 * STATUS simpleList passthrough
 * Upstream: GET /partners/status/:type/simpleList
 */
router.get("/status/:type/simpleList", async (req, res, next) => {
  try {
    const { type } = req.params;
    const data = await clinicall.request(`/partners/status/${type}/simpleList`, {
      method: "GET",
    });
    ok(res, req, data);
  } catch (err) {
    next(err);
  }
});

export default router;
