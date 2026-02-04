// src/routes/schedules.routes.js
import express from "express";
import * as clinicallModule from "../clinicall/client.js";

const clinicall = clinicallModule.default ?? clinicallModule;

const router = express.Router();

function buildSchedulePayload(input = {}) {
  const { patientId, doctorId, date, time, ...rest } = input;

  const normalized = {
    ...rest,
    patientId: patientId ?? rest.patientId,
    performerId: doctorId ?? rest.performerId,
  };

  if (!normalized.started && date && time) {
    normalized.started = `${date}T${time}`;
  }

  return normalized;
}

// SEARCH
router.post("/search", async (req, res, next) => {
  try {
    const payload = buildSchedulePayload(req.body ?? {});
    const data = await clinicall.request("/partners/schedule/v2/search", {
      method: "POST",
      body: payload,
    });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

// CREATE
router.post("/", async (req, res, next) => {
  try {
    const payload = buildSchedulePayload(req.body ?? {});
    const data = await clinicall.request("/partners/schedule", {
      method: "POST",
      body: payload,
    });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

// UPDATE
router.put("/", async (req, res, next) => {
  try {
    const payload = buildSchedulePayload(req.body ?? {});
    const data = await clinicall.request("/partners/schedule", {
      method: "PUT",
      body: payload,
    });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

// CONFIRM
router.post("/:id/confirm", async (req, res, next) => {
  try {
    const { id } = req.params;

    try {
      const data = await clinicall.request("/partners/scheduleConfirm", {
        method: "POST",
        body: { scheduleId: Number(id) || id },
      });
      return res.json({ ok: true, data });
    } catch {
      const data = await clinicall.request(`/partners/${id}/patientStatus/C`, {
        method: "POST",
      });
      return res.json({ ok: true, data });
    }
  } catch (err) {
    next(err);
  }
});

// BOOK (semantic)
router.post("/book", async (req, res, next) => {
  try {
    const payload = buildSchedulePayload(req.body ?? {});
    const data = await clinicall.request("/partners/schedule", {
      method: "POST",
      body: payload,
    });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

// RESCHEDULE (semantic)
router.post("/reschedule", async (req, res, next) => {
  try {
    const payload = buildSchedulePayload(req.body ?? {});
    const data = await clinicall.request("/partners/schedule", {
      method: "PUT",
      body: payload,
    });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

// CANCEL (semantic)
router.post("/cancel", async (req, res, next) => {
  try {
    const { scheduleId, id } = req.body ?? {};
    const targetId = scheduleId ?? id;

    try {
      const data = await clinicall.request("/partners/scheduleCancel", {
        method: "POST",
        body: { scheduleId: Number(targetId) || targetId },
      });
      return res.json({ ok: true, data });
    } catch {
      const data = await clinicall.request(`/partners/${targetId}/patientStatus/B`, {
        method: "POST",
      });
      return res.json({ ok: true, data });
    }
  } catch (err) {
    next(err);
  }
});

// CANCEL by id
router.post("/:id/cancel", async (req, res, next) => {
  try {
    const { id } = req.params;

    try {
      const data = await clinicall.request("/partners/scheduleCancel", {
        method: "POST",
        body: { scheduleId: Number(id) || id },
      });
      return res.json({ ok: true, data });
    } catch {
      const data = await clinicall.request(`/partners/${id}/patientStatus/B`, {
        method: "POST",
      });
      return res.json({ ok: true, data });
    }
  } catch (err) {
    next(err);
  }
});

// STATUS passthrough
router.get("/status/:type/simpleList", async (req, res, next) => {
  try {
    const { type } = req.params;
    const data = await clinicall.request(`/partners/status/${type}/simpleList`, {
      method: "GET",
    });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
