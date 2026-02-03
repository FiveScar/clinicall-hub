// src/routes/schedules.routes.js
import { Router } from "express";
import clinicall from "../clinicall/client.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

/**
 * SCHEDULE SEARCH
 * Hub: POST /schedules/search
 * Clinicall: POST /partners/schedule/v2/search  (alguns tenants usam /partners/schedule/search)
 */
router.post(
  "/search",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};

    // tenta primeiro v2, se der 404 cai pro legado
    try {
      const data = await clinicall.post("/partners/schedule/v2/search", body);
      return res.json(data);
    } catch (err) {
      const msg = String(err?.message || "");
      const is404 =
        msg.includes("404") ||
        msg.includes("Not Found") ||
        msg.toLowerCase().includes("not found");

      if (!is404) throw err;

      const dataLegacy = await clinicall.post("/partners/schedule/search", body);
      return res.json(dataLegacy);
    }
  })
);

/**
 * CONFIRM (GET) - confirmar consulta por scheduleId
 * Hub: GET /schedules/confirm/:scheduleId
 * Clinicall: GET /partners/scheduleConfirm/:scheduleId
 */
router.get(
  "/confirm/:scheduleId",
  asyncHandler(async (req, res) => {
    const { scheduleId } = req.params;
    const data = await clinicall.get(`/partners/scheduleConfirm/${encodeURIComponent(scheduleId)}`);
    return res.json(data);
  })
);

/**
 * CONFIRM (POST) - caso o Clinicall exija POST para confirmar
 * Hub: POST /schedules/confirm
 * Clinicall: POST /partners/scheduleConfirm
 *
 * Body: envie exatamente o que o Clinicall espera (ex: { scheduleId: 123 } ou outros campos)
 */
router.post(
  "/confirm",
  asyncHandler(async (req, res) => {
    const data = await clinicall.post("/partners/scheduleConfirm", req.body ?? {});
    return res.json(data);
  })
);

/**
 * CANCEL
 * Hub: POST /schedules/cancel
 * Clinicall: POST /partners/scheduleCancel
 *
 * Body esperado: { "scheduleId": 67201 }
 */
router.post(
  "/cancel",
  asyncHandler(async (req, res) => {
    const data = await clinicall.post("/partners/scheduleCancel", req.body ?? {});
    return res.json(data);
  })
);

/**
 * STATUS LISTS (simpleList)
 * Hub:
 *  - GET /schedules/status/scheduleStatus/simpleList
 *  - GET /schedules/status/patientStatus/simpleList
 *
 * Clinicall:
 *  - GET /partners/status/scheduleStatus/simpleList
 *  - GET /partners/status/patientStatus/simpleList
 */
router.get(
  "/status/:type/simpleList",
  asyncHandler(async (req, res) => {
    const { type } = req.params; // scheduleStatus | patientStatus
    const data = await clinicall.get(`/partners/status/${encodeURIComponent(type)}/simpleList`);
    return res.json(data);
  })
);

export default router;
