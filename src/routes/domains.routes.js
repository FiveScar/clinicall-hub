import { Router } from "express";
const router = Router();

import { ok } from "../utils/response.js";

router.get("/", (req, res) => ok(res, req, { module: "companies", status: "todo" }));

export default router;
