import { Router } from "express";
import clinicall from "../clinicall/client.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();

/**
 * 🔍 Search schedules (v2)
 * POST /schedules/search
 * -> Clinicall: POST /partners/schedule/v2/search
 */
router.post(
  "/search",
  asyncHandler(async (req, res) => {
    const data = await clinicall.request("/partners/schedule/v2/search", {
      method: "POST",
      body: req.body,
    });
    res.json(data);
  })
);

/**
 * 🧾 Create/Update schedule (upsert)
 * PUT /schedules
 * -> Clinicall: PUT /partners/schedule
 */
router.put(
  "/",
  asyncHandler(async (req, res) => {
    const data = await clinicall.request("/partners/schedule", {
      method: "PUT",
      body: req.body,
    });
    res.json(data);
  })
);

/**
 * ✅ Get schedule confirmation details
 * GET /schedules/confirm/:scheduleId
 * -> Clinicall: GET /partners/scheduleConfirm/:scheduleId
 */
router.get(
  "/confirm/:scheduleId",
  asyncHandler(async (req, res) => {
    const { scheduleId } = req.params;
    const data = await clinicall.request(`/partners/scheduleConfirm/${scheduleId}`);
    res.json(data);
  })
);

/**
 * ✅ Confirm schedule (post confirmation code)
 * POST /schedules/confirm
 * -> Clinicall: POST /partners/scheduleConfirm
 */
router.post(
  "/confirm",
  asyncHandler(async (req, res) => {
    const data = await clinicall.request("/partners/scheduleConfirm", {
      method: "POST",
      body: req.body,
    });
    res.json(data);
  })
);

/**
 * ❌ Cancel schedule
 * POST /schedules/cancel
 * -> Clinicall: POST /partners/scheduleCancel
 */
router.post(
  "/cancel",
  asyncHandler(async (req, res) => {
    const data = await clinicall.request("/partners/scheduleCancel", {
      method: "POST",
      body: req.body,
    });
    res.json(data);
  })
);

/**
 * 🔁 Update schedule status
 * POST /schedules/:scheduleId/:type/:status
 * -> Clinicall: POST /partners/:scheduleId/:type/:status
 *
 * type: patientStatus | scheduleStatus
 */
router.post(
  "/:scheduleId/:type/:status",
  asyncHandler(async (req, res) => {
    const { scheduleId, type, status } = req.params;
    const data = await clinicall.request(`/partners/${scheduleId}/${type}/${status}`, {
      method: "POST",
      body: req.body, // se não precisar body, pode mandar {} do n8n
    });
    res.json(data);
  })
);

/**
 * 📋 Simple status list
 * GET /schedules/status/:type/simpleList
 * -> Clinicall: GET /partners/status/:type/simpleList
 */
router.get(
  "/status/:type/simpleList",
  asyncHandler(async (req, res) => {
    const { type } = req.params;
    const data = await clinicall.request(`/partners/status/${type}/simpleList`);
    res.json(data);
  })
);

export default router;
