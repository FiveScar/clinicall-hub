// src/routes/clinic.routes.js
import { Router } from "express";
import { CLINIC, getClinicSection } from "../config/clinic.js";

const router = Router();

/**
 * GET /clinic/info
 * Retorna todas as informações da clínica.
 * Query param ?section=address|hours|contacts|services|...
 */
router.get("/info", (_req, res) => {
  const section = _req.query.section || "all";
  res.json({ ok: true, data: getClinicSection(section) });
});

/**
 * Atalhos por seção
 */
router.get("/address",      (_req, res) => res.json({ ok: true, data: getClinicSection("address") }));
router.get("/hours",         (_req, res) => res.json({ ok: true, data: getClinicSection("hours") }));
router.get("/contacts",      (_req, res) => res.json({ ok: true, data: getClinicSection("contacts") }));
router.get("/services",      (_req, res) => res.json({ ok: true, data: getClinicSection("services") }));
router.get("/insurance",     (_req, res) => res.json({ ok: true, data: getClinicSection("insurance") }));
router.get("/payment",       (_req, res) => res.json({ ok: true, data: getClinicSection("payment") }));
router.get("/instructions",  (_req, res) => res.json({ ok: true, data: getClinicSection("instructions") }));
router.get("/messages",      (_req, res) => res.json({ ok: true, data: getClinicSection("messages") }));

export default router;
