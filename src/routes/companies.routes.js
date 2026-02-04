import express from "express";
import clinicall from "../clinicall/client.js";
import { ok } from "../utils/response.js";

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const data = await clinicall.request("/partners/company", { method: "GET" });
    ok(res, req, data);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const data = await clinicall.request(`/partners/company/${req.params.id}`, {
      method: "GET",
    });
    ok(res, req, data);
  } catch (err) {
    next(err);
  }
});

export default router;
