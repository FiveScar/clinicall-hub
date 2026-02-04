import express from "express";
import clinicall from "../clinicall/client.js";

const router = express.Router();

router.post("/search", async (req, res, next) => {
  try {
    const data = await clinicall.request("/partners/insurance/search", {
      method: "POST",
      body: req.body,
    });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
