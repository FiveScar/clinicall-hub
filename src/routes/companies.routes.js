import { Router } from "express";
import clinicall from "../clinicall/client.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

/**
 * GET /companies
 * -> Clinicall: GET /partners/company
 */
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const data = await clinicall.request("/partners/company", { method: "GET" });
    res.json(data);
  })
);

/**
 * GET /companies/:companyId
 * -> Clinicall: GET /partners/company/:companyId
 */
router.get(
  "/:companyId",
  asyncHandler(async (req, res) => {
    const { companyId } = req.params;

    const data = await clinicall.request(`/partners/company/${companyId}`, {
      method: "GET",
    });

    res.json(data);
  })
);

export default router;
