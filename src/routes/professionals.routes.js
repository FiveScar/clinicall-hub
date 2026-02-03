import { Router } from "express";
import clinicall from "../clinicall/client.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();

/**
 * 🔍 Search professionals (solicitantes)
 * POST /professionals/search
 */
router.post(
  "/search",
  asyncHandler(async (req, res) => {
    const data = await clinicall.request(
      "/partners/professional/search",
      { method: "POST", body: req.body }
    );
    res.json(data);
  })
);

/**
 * 👤 Professional by ID
 * GET /professionals/:id
 */
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = await clinicall.request(
      `/partners/professional/${id}`
    );
    res.json(data);
  })
);

/**
 * 🎭 Performer search (executantes)
 * POST /professionals/performers/search
 */
router.post(
  "/performers/search",
  asyncHandler(async (req, res) => {
    const data = await clinicall.request(
      "/partners/performer/search",
      { method: "POST", body: req.body }
    );
    res.json(data);
  })
);

/**
 * 🎭 Performer by ID
 * GET /professionals/performers/:id
 */
router.get(
  "/performers/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = await clinicall.request(
      `/partners/performer/${id}`
    );
    res.json(data);
  })
);

export default router;
