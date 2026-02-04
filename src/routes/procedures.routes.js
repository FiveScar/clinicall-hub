import express from "express";
import clinicall from "../clinicall/client.js";
import buildResponse from "../utils/buildResponse.js";

const router = express.Router();

router.post("/search", async (req, res, next) => {
  try {
    const data = await clinicall.request("/partners/procedure/search", {
      method: "POST",
      body: req.body,
    });
    res.json(buildResponse({ data, requestId: req.requestId }));
  } catch (err) {
    next(err);
  }
});

export default router;
