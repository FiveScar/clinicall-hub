import express from "express";
import clinicall from "../clinicall/client.js";

const router = express.Router();

router.get("/", async (_req, res, next) => {
  try {
    const data = await clinicall.request("/partners/company", { method: "GET" });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const data = await clinicall.request(`/partners/company/${req.params.id}`, {
      method: "GET",
    });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
