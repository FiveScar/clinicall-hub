import express from "express";
import * as clinicallModule from "../clinicall/client.js";

const clinicall = clinicallModule.default ?? clinicallModule;
const router = express.Router();

function toInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function buildPageSearchTO(input = {}) {
  return {
    argument: (input.argument ?? input.search ?? "").toString(),
    page: toInt(input.page, 0),
    sizePage: toInt(input.sizePage, 25),
    fieldSort: (input.fieldSort ?? "name").toString(),
    sortDirection: (input.sortDirection ?? "asc").toString(),
  };
}

/**
 * POST /insurances/search
 * -> Clinicall: POST /partners/insurance/accreditation/search
 *
 * Hub-friendly:
 * { search, companyId?, performerId?, insuranceId?, page, sizePage, fieldSort, sortDirection }
 */
router.post("/search", async (req, res, next) => {
  try {
    const bodyIn = req.body ?? {};

    const payload = {
      insuranceId: bodyIn.insuranceId ?? null,
      performerId: bodyIn.performerId ?? null,
      companyId: bodyIn.companyId ?? null,
      pageSearchTO: buildPageSearchTO(bodyIn),
    };

    const data = await clinicall.request("/partners/insurance/accreditation/search", {
      method: "POST",
      body: payload,
    });

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
