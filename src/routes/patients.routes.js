// src/routes/patients.routes.js
import { Router } from "express";
import { clinicallRequest } from "../clinicall/client.js";

const router = Router();

/**
 * Utils
 */
function onlyDigits(v) {
  return String(v ?? "").replace(/\D+/g, "");
}

function normalizeBRPhoneDigits(raw) {
  // Aceita: +55..., 55..., (83) 9 8670-2026, 83986702026
  let d = onlyDigits(raw);

  // remove prefixo 55 se vier junto
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) {
    d = d.slice(2);
  }

  return d; // esperado: 10 ou 11 dígitos (DDD + número)
}

function looksLikeBRPhone(raw) {
  const d = normalizeBRPhoneDigits(raw);
  return d.length === 10 || d.length === 11;
}

function buildSearchPayload({ argument, page = 0, sizePage = 25, fieldSort = "name", sortDirection = "asc" }) {
  return { argument, page, sizePage, fieldSort, sortDirection };
}

async function upstreamPatientSearch(payload) {
  // Clinicall: POST /partners/patient/search
  return clinicallRequest("POST", "/partners/patient/search", payload);
}

function toPageResult(found, sizePage = 25) {
  const content = Array.isArray(found) ? found : [];
  return {
    content,
    pageable: {},
    totalPages: content.length ? 1 : 0,
    totalElements: content.length,
    last: true,
    numberOfElements: content.length,
    size: sizePage,
    number: 0,
    sort: {},
    first: true,
    empty: content.length === 0,
  };
}

/**
 * GET /patients/:id
 */
router.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = await clinicallRequest("GET", `/partners/patient/${id}`);
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /patients
 */
router.post("/", async (req, res, next) => {
  try {
    const payload = req.body ?? {};
    const data = await clinicallRequest("POST", "/partners/patient", payload);
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /patients/:id
 */
router.put("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const payload = { ...(req.body ?? {}), id };
    const data = await clinicallRequest("PUT", "/partners/patient", payload);
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /patients/:id
 */
router.delete("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = await clinicallRequest("DELETE", `/partners/patient/${id}`);
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /patients/birthday/today-month/:day
 * GET /patients/birthday/today-month/:month/:day
 * (mantive como estava no seu arquivo)
 */
router.get("/birthday/today-month/:day", async (req, res, next) => {
  try {
    const day = Number(req.params.day);
    const data = await clinicallRequest("GET", `/partners/patient/birthday/today-month/${day}`);
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

router.get("/birthday/today-month/:month/:day", async (req, res, next) => {
  try {
    const month = Number(req.params.month);
    const day = Number(req.params.day);
    const data = await clinicallRequest("GET", `/partners/patient/birthday/today-month/${month}/${day}`);
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /patients/search
 * - Caso argument pareça TELEFONE: tenta variações + fallback filtrando por phoneStandart (com limite anti-loop)
 * - Caso contrário: repassa normal
 */
router.post("/search", async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const rawArgument = body.argument ?? "";
    const page = Number.isFinite(body.page) ? body.page : 0;
    const sizePage = Number.isFinite(body.sizePage) ? body.sizePage : 25;
    const fieldSort = body.fieldSort ?? "name";
    const sortDirection = body.sortDirection ?? "asc";

    // comportamento padrão
    const defaultPayload = buildSearchPayload({ argument: rawArgument, page, sizePage, fieldSort, sortDirection });

    // Se não parece telefone, mantém normal
    if (!looksLikeBRPhone(rawArgument)) {
      const data = await upstreamPatientSearch(defaultPayload);
      res.json({ ok: true, data });
      return;
    }

    // Heurística de telefone
    const phone = normalizeBRPhoneDigits(rawArgument);

    // Variações controladas (anti-loop)
    const variations = [];
    if (phone) variations.push(phone);
    if (phone.length >= 9) variations.push(phone.slice(-9));
    if (phone.length >= 8) variations.push(phone.slice(-8));

    // 1) tenta variações no próprio search
    for (const v of variations) {
      const payload = buildSearchPayload({ argument: v, page: 0, sizePage, fieldSort, sortDirection });
      const data = await upstreamPatientSearch(payload);

      if (data?.content?.length) {
        res.json({ ok: true, data });
        return;
      }
    }

    // 2) fallback final: busca "vazia" e filtra phoneStandart (limitado)
    // IMPORTANTE: limite rígido pra não queimar tokens/requests
    const MAX_PAGES = 5;
    const SCAN_SIZE = 100;

    const found = [];
    for (let p = 0; p < MAX_PAGES; p++) {
      const scanPayload = buildSearchPayload({
        argument: "",
        page: p,
        sizePage: SCAN_SIZE,
        fieldSort,
        sortDirection,
      });

      const data = await upstreamPatientSearch(scanPayload);
      const list = Array.isArray(data?.content) ? data.content : [];

      for (const item of list) {
        const itemPhone = normalizeBRPhoneDigits(item?.phoneStandart ?? item?.phone ?? "");
        if (itemPhone && itemPhone === phone) found.push(item);
      }

      // se veio menos que SCAN_SIZE, acabou a lista
      if (list.length < SCAN_SIZE) break;

      // se já achou algo, já pode parar também
      if (found.length) break;
    }

    const dataOut = toPageResult(found, sizePage);
    res.json({ ok: true, data: dataOut });
  } catch (err) {
    next(err);
  }
});

export default router;