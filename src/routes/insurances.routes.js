// src/routes/insurances.routes.js
import express from "express";
import * as clinicallModule from "../clinicall/client.js";

const clinicall = clinicallModule.default ?? clinicallModule;
const router = express.Router();

/**
 * POST /insurances/search
 *
 * BFF inteligente:
 * - Modo A: Lista convênios (catálogo)
 *   -> Clinicall: POST /partners/insurance/search
 *   Body aceito no Hub:
 *   { search?: string, page?: number, sizePage?: number, fieldSort?: string, sortDirection?: "asc"|"desc" }
 *
 * - Modo B: Credenciamento (relaciona convênio + profissional + unidade)
 *   -> Clinicall: POST /partners/insurance/accreditation/search
 *   Body aceito no Hub:
 *   {
 *     insuranceId: number (OBRIGATÓRIO),
 *     performerId?: number|null,
 *     companyId?: number|null,
 *     search?: string,
 *     page?: number,
 *     sizePage?: number,
 *     fieldSort?: string,
 *     sortDirection?: "asc"|"desc"
 *   }
 */
router.post("/search", async (req, res, next) => {
  try {
    const body = req.body ?? {};

    // Normalização padrão de paginação/filtro (compatível com docs Clinicall)
    const search = typeof body.search === "string" ? body.search : (typeof body.argument === "string" ? body.argument : "");
    const page = Number.isFinite(body.page) ? body.page : 0;
    const sizePage = Number.isFinite(body.sizePage) ? body.sizePage : 25;
    const fieldSort = typeof body.fieldSort === "string" ? body.fieldSort : "name";
    const sortDirection = (body.sortDirection === "desc" ? "desc" : "asc");

    const hasAccreditationHints =
      body.companyId != null ||
      body.performerId != null ||
      body.insuranceId != null;

    // ===== MODO B: CREDENCIAMENTO =====
    if (hasAccreditationHints) {
      const insuranceId = body.insuranceId;

      if (insuranceId == null || insuranceId === "") {
        return res.status(400).json({
          ok: false,
          error: "VALIDATION_ERROR",
          details:
            "Para buscar credenciamento (por profissional/unidade), informe insuranceId (id do convênio).",
          required_fields: ["insuranceId"],
          example: {
            insuranceId: 3,
            performerId: 13,
            companyId: 100000,
            search: "",
            page: 0,
            sizePage: 25,
          },
        });
      }

      const payload = {
        insuranceId: Number(insuranceId),
        performerId: body.performerId != null ? Number(body.performerId) : null,
        companyId: body.companyId != null ? Number(body.companyId) : null,
        pageSearchTO: {
          argument: search ?? "",
          page,
          sizePage,
          fieldSort,
          sortDirection,
        },
      };

      const data = await clinicall.request("/partners/insurance/accreditation/search", {
        method: "POST",
        body: payload,
      });

      return res.json({ ok: true, data });
    }

    // ===== MODO A: LISTA DE CONVÊNIOS =====
    const payload = {
      argument: search ?? "",
      page,
      sizePage,
      fieldSort,
      sortDirection,
    };

    const data = await clinicall.request("/partners/insurance/search", {
      method: "POST",
      body: payload,
    });

    return res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
