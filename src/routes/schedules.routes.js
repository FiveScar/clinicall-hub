import { Router } from "express";
import clinicall from "../clinicall/client.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

/**
 * 🔍 Search schedules (auto v2 fallback)
 * POST /schedules/search
 */
router.post(
  "/search",
  asyncHandler(async (req, res) => {
    try {
      // tenta v2 primeiro
      const data = await clinicall.request("/partners/schedule/v2/search", {
        method: "POST",
        body: req.body,
      });
      return res.json(data);
    } catch (err) {
      // fallback v1
      const data = await clinicall.request("/partners/schedule/search", {
        method: "POST",
        body: req.body,
      });
      return res.json(data);
    }
  })
);

/**
 * 🧾 Create/Update schedule
 * PUT /schedules
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
 * ✅ Get confirmation details
 * GET /schedules/confirm/:scheduleId
 */
router.get(
  "/confirm/:scheduleId",
  asyncHandler(async (req, res) => {
    const { scheduleId } = req.params;
    const data = await clinicall.request(
      `/partners/scheduleConfirm/${scheduleId}`
    );
    res.json(data);
  })
);

/**
 * ✅ Confirm schedule
 * POST /schedules/confirm
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
 * ❌ Cancel schedule (auto fallback)
 * POST /schedules/cancel
 */
router.post(
  "/cancel",
  asyncHandler(async (req, res) => {
    try {
      const data = await clinicall.request(
        "/partners/schedule/v2/cancel",
        {
          method: "POST",
          body: req.body,
        }
      );
      return res.json(data);
    } catch (err) {
      const data = await clinicall.request(
        "/partners/schedule/cancel",
        {
          method: "POST",
          body: req.body,
        }
      );
      return res.json(data);
    }
  })
);

export default router;
