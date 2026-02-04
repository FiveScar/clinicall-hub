import express from "express";
import { runRPC } from "../orchestrator/rpcEngine.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { op, data = {} } = req.body || {};

  const result = await runRPC(op, data);
  res.json(result);
});

export default router;
