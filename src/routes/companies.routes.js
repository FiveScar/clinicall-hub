import express from "express";
import clinicall from "../clinicall/client.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

router.get("/all", asyncHandler(async (_req, res) => {
  const data = await clinicall.get("/partners/company/simpleList");
  res.json(data);
}));

export default router;
