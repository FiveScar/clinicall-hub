import express from "express";
import clinicall from "../clinicall/client.js";

const router = express.Router();

router.post("/search", async (req, res, next) => {
  try {
    const data = await clinicall.request("/partners/performer/search", {
      method: "POST",
      body: req.body,
    });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const data = await clinicall.request(`/partners/performer/${req.params.id}`, {
      method: "GET",
    });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
