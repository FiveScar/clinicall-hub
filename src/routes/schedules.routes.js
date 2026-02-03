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
 /**
 * ❌ Cancel schedule (v2)
 * POST /schedules/cancel
 * -> Clinicall: POST /partners/schedule/v2/cancel
 */
router.post(
  "/cancel",
  asyncHandler(async (req, res) => {
    const data = await clinicall.request("/partners/schedule/v2/cancel", {
      method: "POST",
      body: req.body,
    });
    res.json(data);
  })
);

export default router;
