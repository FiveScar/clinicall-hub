import express from "express";
import clinicall from "../clinicall/client.js";
import { ok } from "../utils/response.js";

const router = express.Router();

router.post("/search", async (req, res, next) => {
  try {
    const data = await clinicall.request("/partners/speciality/search", {
      method: "POST",
      body: req.body,
    });
    ok(res, req, data);
  } catch (err) {
    next(err);
  }
});

export default router;
