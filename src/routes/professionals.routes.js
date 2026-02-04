// src/routes/orders.routes.js
import express from "express";
import clinicall from "../clinicall/client.js";

const router = express.Router();

/**
 * POST /orders
 * Cria uma nova OS
 * -> Clinicall: POST /partners/order
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
 * Cria uma OS a partir da agenda
 * -> Clinicall: POST /partners/order/schedule?scheduleId=
 */
router.post("/schedule", async (req, res, next) => {
  try {
    const { scheduleId } = req.query;

    if (!scheduleId) {
      return res.status(400).json({
        ok: false,
        error: "missing_scheduleId",
        details: "Envie scheduleId na querystring: /orders/schedule?scheduleId=123",
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
 * Emite Guia TISS (retorna name + pdf base64)
 * -> Clinicall: GET /partners/order/:orderId
 */
router.get("/:orderId", async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const data = await clinicall.request(`/partners/order/${orderId}`, {
      method: "GET",
    });

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
