// src/routes/schedules.routes.js
import { Router } from "express";
import clinicall from "../clinicall/client.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

/**
 * Remove chaves com null/undefined (Clinicall costuma rejeitar alguns nulls)
 */
function stripNulls(obj) {
  if (!obj || typeof obj !== "object") return {};
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== null && v !== undefined)
  );
}

/**
 * SEARCH
 * Hub: POST /schedules/search
 * Clinicall: POST /partners/schedule/v2/search (fallback: /partners/schedule/search)
 */
router.post(
  "/search",
  asyncHandler(async (req, res) => {
    const body = stripNulls(req.body || {});

    // tenta v2 primeiro
    try {
      const dataV2 = await clinicall.request("/partners/schedule/v2/search", {
        method: "POST",
        body,
      });
      return res.json(dataV2);
    } catch (err) {
      const msg = String(err?.message || "");
      const is404 =
        msg.includes(" 404") ||
        msg.includes("404:") ||
        msg.toLowerCase().includes("not found");

      // se NÃO for 404, devolve erro mesmo
      if (!is404) throw err;

      // fallback v1
      const dataV1 = await clinicall.request("/partners/schedule/search", {
        method: "POST",
        body,
      });
      return res.json(dataV1);
    }
  })
);

/**
 * STATUS LISTS (simpleList)
 * Hub:
 *  GET /schedules/status/patientStatus/simpleList
 *  GET /schedules/status/scheduleStatus/simpleList
 *
 * Clinicall:
 *  GET /partners/status/{type}/simpleList
 */
router.get(
  "/status/:type/simpleList",
  asyncHandler(async (req, res) => {
    const { type } = req.params; // patientStatus | scheduleStatus

    const data = await clinicall.request(
      `/partners/status/${encodeURIComponent(type)}/simpleList`,
      { method: "GET" }
    );
    return res.json(data);
  })
);

/**
 * CONFIRM (GET)
 * Hub: GET /schedules/confirm/:scheduleId
 * Clinicall: GET /partners/scheduleConfirm/:scheduleId
 */
router.get(
  "/confirm/:scheduleId",
  asyncHandler(async (req, res) => {
    const { scheduleId } = req.params;

    const data = await clinicall.request(
      `/partners/scheduleConfirm/${encodeURIComponent(scheduleId)}`,
      { method: "GET" }
    );
    return res.json(data);
  })
);

/**
 * CONFIRM (POST)
 * Hub: POST /schedules/confirm
 * Clinicall: POST /partners/scheduleConfirm
 * Body típico: { scheduleId: 67201 }
 */
router.post(
  "/confirm",
  asyncHandler(async (req, res) => {
    const body = stripNulls(req.body || {});
    const data = await clinicall.request("/partners/scheduleConfirm", {
      method: "POST",
      body,
    });
    return res.json(data);
  })
);

/**
 * CANCEL
 * Hub: POST /schedules/cancel
 * Clinicall: POST /partners/scheduleCancel
 * Body: { scheduleId: 67201 }
 */
router.post(
  "/cancel",
  asyncHandler(async (req, res) => {
    const body = stripNulls(req.body || {});
    const data = await clinicall.request("/partners/scheduleCancel", {
      method: "POST",
      body,
    });
    return res.json(data);
  })
);

export default router;
