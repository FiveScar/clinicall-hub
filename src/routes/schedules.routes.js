// src/routes/schedules.routes.js
import express from "express";
import clinicall from "../clinicall/client.js";

const router = express.Router();

/**
 * ✅ POST /schedules/search
 * -> Clinicall: POST /partners/schedule/v2/search
 */
router.post("/search", async (req, res, next) => {
  try {
    const data = await clinicall.request("/partners/schedule/v2/search", {
      method: "POST",
      body: req.body,
    });

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * ✅ GET /schedules/status/:type/simpleList
 * type: patientStatus | scheduleStatus
 * -> Clinicall: GET /partners/status/:type/simpleList
 */
router.get("/status/:type/simpleList", async (req, res, next) => {
  try {
    const { type } = req.params;

    const allowed = new Set(["patientStatus", "scheduleStatus"]);
    if (!allowed.has(type)) {
      return res.status(400).json({
        ok: false,
        error: "type inválido. Use patientStatus ou scheduleStatus.",
      });
    }

    const data = await clinicall.request(`/partners/status/${type}/simpleList`, {
      method: "GET",
    });

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * 🧪 GET /schedules/confirm/:scheduleId
 * -> Clinicall: GET /partners/scheduleConfirm/:scheduleId
 */
router.get("/confirm/:scheduleId", async (req, res, next) => {
  try {
    const { scheduleId } = req.params;

    if (!scheduleId) {
      return res.status(400).json({ ok: false, error: "scheduleId obrigatório" });
    }

    const data = await clinicall.request(`/partners/scheduleConfirm/${scheduleId}`, {
      method: "GET",
    });

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * ❌/🧪 POST /schedules/confirm
 * -> Clinicall: POST /partners/scheduleConfirm
 * Body: repassa tudo (mínimo: scheduleId)
 */
router.post("/confirm", async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const { scheduleId } = body;

    if (!scheduleId) {
      return res.status(400).json({ ok: false, error: "scheduleId obrigatório" });
    }

    const data = await clinicall.request("/partners/scheduleConfirm", {
      method: "POST",
      body,
    });

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * ❌/🧪 POST /schedules/cancel
 * -> Clinicall: POST /partners/scheduleCancel
 * Body: repassa tudo (mínimo: scheduleId)
 */
router.post("/cancel", async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const { scheduleId } = body;

    if (!scheduleId) {
      return res.status(400).json({ ok: false, error: "scheduleId obrigatório" });
    }

    const data = await clinicall.request("/partners/scheduleCancel", {
      method: "POST",
      body,
    });

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
