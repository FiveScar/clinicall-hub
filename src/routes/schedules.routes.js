import express from "express";
import clinicall from "../clinicall/client.js";

const router = express.Router();

/**
 * search
 */
router.post("/search", async (req, res, next) => {
  try {
    const data = await clinicall.request("/partners/schedule/v2/search", {
      method: "POST",
      body: req.body,
    });

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * status list passthrough
 */
router.get("/status/:type/simpleList", async (req, res, next) => {
  try {
    const { type } = req.params;

    const data = await clinicall.request(`/partners/status/${type}/simpleList`, {
      method: "GET",
    });

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * confirm via patientStatus = C
 */
router.post("/:id/confirm", async (req, res, next) => {
  try {
    const { id } = req.params;

    const data = await clinicall.request(`/partners/${id}/patientStatus/C`, {
      method: "POST",
    });

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * cancel via patientStatus = B
 */
router.post("/:id/cancel", async (req, res, next) => {
  try {
    const { id } = req.params;

    const data = await clinicall.request(`/partners/${id}/patientStatus/B`, {
      method: "POST",
    });

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
