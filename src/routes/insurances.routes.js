import express from "express";
import * as clinicallModule from "../clinicall/client.js";

const clinicall = clinicallModule.default ?? clinicallModule;

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
