// src/routes/auth.routes.js
import { Router } from "express";
import clinicall from "../clinicall/client.js";

const router = Router();

/**
 * GET /auth/ping
 * Testa login automático + chamada real no CRM
 * NÃO expõe senha/token
 */
router.get("/ping", async (_req, res) => {
  try {
    // chamada real no CRM (usa auto-auth + retry)
    const data = await clinicall.request("/partners/company", { method: "GET" });

    return res.json({
      ok: true,
      message: "auth ok (able to call /partners/company)",
      sample: Array.isArray(data) ? data.slice(0, 1) : data,
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: "auth_failed",
      details: String(e?.message || e),
      env: {
        CLINICALL_BASE_URL: !!process.env.CLINICALL_BASE_URL,
        CLINICALL_TENANTID: !!process.env.CLINICALL_TENANTID,
        CLINICALL_LOGIN: !!process.env.CLINICALL_LOGIN,
        CLINICALL_PASSWORD: !!process.env.CLINICALL_PASSWORD,
        CLINICALL_AUTH_PATH: process.env.CLINICALL_AUTH_PATH || "(default /authenticate)",
      },
    });
  }
});

export default router;
