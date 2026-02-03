import { Router } from "express";
import clinicall from "../clinicall/client.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

// POST /companies/search
router.post(
  "/search",
  asyncHandler(async (req, res) => {
    const data = await clinicall.request("/partners/company/search", {
      method: "POST",
      body: req.body,
    });

    res.json(data);
  })
);

export default router;
