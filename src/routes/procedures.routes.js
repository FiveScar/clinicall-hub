import { Router } from "express";
const router = Router();

router.get("/", (_req, res) => res.json({ ok: true, module: "companies", status: "todo" }));

export default router;
