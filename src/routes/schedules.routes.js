import { Router } from "express";
import clinicall from "../clinicall/client.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

/**
 * POST /schedules/search
 * - tenta v2 primeiro
 * - se v2 retornar erro (code != INFO), tenta v1
 */
router.post(
  "/search",
  asyncHandler(async (req, res) => {
    // 1) tenta v2
    try {
      const v2 = await clinicall.request("/partners/schedule/v2/search", {
        method: "POST",
        body: req.body,
      });
      return res.json(v2);
    } catch (err) {
      // 2) se v2 falhar (ex: 403 formulario inválido), tenta v1
      const v1 = await clinicall.request("/partners/schedule/search", {
        method: "POST",
        body: req.body,
      });
      return res.json(v1);
    }
  })
);

/**
 * GET /schedules/status/patientStatus/simpleList
 * -> Clinicall: GET /partners/status/patientStatus/simpleList
 */
router.get(
  "/status/patientStatus/simpleList",
  asyncHandler(async (_req, res) => {
    const data = await clinicall.request("/partners/status/patientStatus/simpleList", {
      method: "GET",
    });
    return res.json(data);
  })
);

/**
 * GET /schedules/status/scheduleStatus/simpleList
 * -> Clinicall: GET /partners/status/scheduleStatus/simpleList
 */
router.get(
  "/status/scheduleStatus/simpleList",
  asyncHandler(async (_req, res) => {
    const data = await clinicall.request("/partners/status/scheduleStatus/simpleList", {
      method: "GET",
    });
    return res.json(data);
  })
);

/**
 * POST /schedules/cancel
 * - tenta v2 primeiro
 * - se v2 retornar erro (code != INFO), tenta v1
 *
 * body esperado (exemplo):
 * { "scheduleId": 123, "reason": "...", ... }  (depende do que a Clinicall pede no seu tenant)
 */
router.post(
  "/cancel",
  asyncHandler(async (req, res) => {
    const v2 = await clinicall.request("/partners/schedule/v2/cancel", {
      method: "POST",
      body: req.body,
    });

    if (v2 && typeof v2 === "object" && v2.code && v2.code !== "INFO") {
      const v1 = await clinicall.request("/partners/schedule/cancel", {
        method: "POST",
        body: req.body,
      });
      return res.json(v1);
    }

    return res.json(v2);
  })
);

export default router;
