import { Router } from "express";
import buildResponse from "../utils/buildResponse.js";
const router = Router();

router.get("/", (req, res) =>
  res.json(buildResponse({ data: { module: "companies", status: "todo" }, requestId: req.requestId }))
);

export default router;
