// src/routes/index.routes.js
import { Router } from "express";
import * as patientIndex from "../index/patientIndex.js";

const router = Router();

router.get("/patients/status", async (_req, res) => {
  const s = await patientIndex.status();
  res.json(s);
});

router.post("/patients/rebuild", async (_req, res) => {
  patientIndex.rebuildIndexAsync();
  res.json({ ok: true, started: true });
});

export default router;
