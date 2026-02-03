import { Router } from "express";
import clinicall from "../clinicall/client.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

// GET /companies/all
router.get(
  "/all",
  asyncHandler(async (_req, res) => {
    const data = await clinicall.request("/partners/company/all");
    res.json(data);
  })
);

export default router;
