import express from "express";
import * as clinicallModule from "../clinicall/client.js";

const clinicall = clinicallModule.default ?? clinicallModule;

const router = express.Router();

/**
 * POST /orders
 */
router.post("/", async (req, res, next) => {
  try {
    const data = await clinicall.request("/partners/order", {
      method: "POST",
      body: req.body,
    });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /orders/schedule?scheduleId=123
 */
router.post("/schedule", async (req, res, next) => {
  try {
    const { scheduleId } = req.query;

    if (!scheduleId) {
      return res.status(400).json({
        ok: false,
        error: "missing_scheduleId",
      });
    }

    const data = await clinicall.request(
      `/partners/order/schedule?scheduleId=${encodeURIComponent(String(scheduleId))}`,
      { method: "POST" }
    );

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /orders/:orderId
 */
router.get("/:orderId", async (req, res, next) => {
  try {
    const data = await clinicall.request(`/partners/order/${req.params.orderId}`, {
      method: "GET",
    });

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
