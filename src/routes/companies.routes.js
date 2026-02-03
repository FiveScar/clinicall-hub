import { Router } from "express";
import clinicall from "../clinicall/client.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();

/**
 * 🏢 List all companies
 * GET /companies/all
 * -> Clinicall: GET /partners/company/all
 */
router.get(
  "/all",
  asyncHandler(async (_req, res) => {
    const data = await clinicall.request("/partners/company/all");
    res.json(data);
  })
);

/**
 * 🔎 "Search" companies (client-side filter)
 * POST /companies/search
 * body: { "argument": "texto" }
 *
 * -> Calls /partners/company/all and filters by name/alias.
 */
router.post(
  "/search",
  asyncHandler(async (req, res) => {
    const { argument = "" } = req.body || {};
    const raw = await clinicall.request("/partners/company/all");

    // Clinicall costuma retornar {code,message,data:[...]} ou direto array — tratamos os 2
    const list = Array.isArray(raw) ? raw : raw?.data || [];

    const q = String(argument || "").trim().toLowerCase();
    const filtered =
      q.length === 0
        ? list
        : list.filter((c) => {
            const name = String(c?.name || "").toLowerCase();
            const alias = String(c?.alias || "").toLowerCase();
            return name.includes(q) || alias.includes(q);
          });

    res.json({
      code: "INFO",
      message: "Operação realizada com sucesso ",
      details: null,
      data: filtered,
    });
  })
);

export default router;
