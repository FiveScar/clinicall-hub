import express from "express";
import clinicall from "../clinicall/client.js";

const router = express.Router();

/**
 * POST /schedules/search
 */
router.post("/search", async (req, res, next) => {
  try {
    const data = await clinicall.request({
      method: "POST",
      path: "/partners/schedule/v2/search",
      body: req.body,
    });

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /schedules/status/:type/simpleList
 */
router.get("/status/:type/simpleList", async (req, res, next) => {
  try {
    const { type } = req.params;

    const data = await clinicall.request({
      method: "GET",
      path: `/partners/status/${type}/simpleList`,
    });

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /schedules/confirm/:scheduleId
 */
router.get("/confirm/:scheduleId", async (req, res, next) => {
  try {
    const { scheduleId } = req.params;

    const data = await clinicall.request({
      method: "GET",
      path: `/partners/scheduleConfirm/${scheduleId}`,
    });

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /schedules/confirm
 */
router.post("/confirm", async (req, res, next) => {
  try {
    const { scheduleId } = req.body;

    const data = await clinicall.request({
      method: "POST",
      path: "/partners/scheduleConfirm",
      body: { scheduleId },
    });

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /schedules/cancel
 */
router.post("/cancel", async (req, res, next) => {
  try {
    const { scheduleId } = req.body;

    const data = await clinicall.request({
      method: "POST",
      path: "/partners/scheduleCancel",
      body: { scheduleId },
    });

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
