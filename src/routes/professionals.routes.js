import { Router } from "express";
import clinicall from "../clinicall/client.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();

/**
 * 🎭 Performers search
 * POST /professionals/performers/search
 */
router.post(
  "/performers/search",
  asyncHandler(async (req, res) => {
    const data = await clinicall.request("POST", "/performers/search", req.body);
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
    const data = await clinicall.request("GET", `/performers/${id}`);
    res.json(data);
  })
);

/**
 * 🔍 Search professionals
 * POST /professionals/search
 */
router.post(
  "/search",
  asyncHandler(async (req, res) => {
    const data = await clinicall.request("POST", "/professionals/search", req.body);
    res.json(data);
  })
);

/**
 * 👤 Get professional by ID
 * GET /professionals/:id
 */
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = await clinicall.request("GET", `/professionals/${id}`);
    res.json(data);
  })
);

export default router;
