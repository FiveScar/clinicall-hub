// src/routes/parameters.routes.js
import { Router } from "express";
import clinicall from "../clinicall/client.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const data = await clinicall.request("/partners/parameters", { method: "GET" });
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get("/order-arrive/:companyId/:performerId", async (req, res, next) => {
  try {
    const { companyId, performerId } = req.params;
    const data = await clinicall.request(
      `/partners/company-performer/${companyId}/${performerId}/order-arrive`,
      { method: "GET" }
    );
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

export default router;
