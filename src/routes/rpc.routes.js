import express from "express";
import { runRpc } from "../orchestrator/rpcengine.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { op, data = {} } = req.body || {};
  const result = await runRpc({ op, data });
  res.json(result);
});

export default router;
