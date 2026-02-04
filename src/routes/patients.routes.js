// src/routes/patients.routes.js
import express from "express";
import clinicall from "../clinicall/client.js";


const router = express.Router();

function isClinicall404(err) {
  const msg = err?.message || "";
  return msg.includes("404");
}

function isClinicall500(err) {
  const msg = err?.message || "";
  return msg.includes("500") || msg.includes("SYSTEM_EXCEPTION");
}

function onlyDigits(v) {
  return String(v ?? "").replace(/\D/g, "");
}

function looksLikeCpf(v) {
  return onlyDigits(v).length === 11;
}

/**
 * Quando o Clinicall não retorna por CPF via /partners/patient/search,
 * fazemos paginação com argument="" e filtramos localmente pelo cpf.
 */
async function searchPatientByCpfFallback({
  cpfDigits,
  sizePage = 25,
  fieldSort = "name",
  sortDirection = "asc",
  maxPages = 20, // limite de segurança (20 * 25 = 500 registros varridos)
}) {
  for (let page = 0; page < maxPages; page++) {
    const data = await clinicall.request("/partners/patient/search", {
      method: "POST",
      body: {
        argument: "",
        page,
        sizePage,
        fieldSort,
        sortDirection,
      },
    });

    const content = Array.isArray(data?.content) ? data.content : [];
    const matches = content.filter((p) => onlyDigits(p?.cpf) === cpfDigits);

    if (matches.length) {
      // Mantém formato "page" compatível com o que o Clinicall retorna
      return {
        ...data,
        content: matches,
        numberOfElements: matches.length,
        totalElements: matches.length,
        totalPages: 1,
        number: 0,
        first: true,
        last: true,
        empty: false,
      };
    }

    // se acabou a paginação, para
    if (data?.last === true || content.length === 0) {
      return {
        ...data,
        content: [],
        numberOfElements: 0,
        totalElements: 0,
        totalPages: 0,
        number: 0,
        first: true,
        last: true,
        empty: true,
      };
    }
  }

  // estourou limite de páginas: devolve vazio (evita travar agente)
  return {
    content: [],
    pageable: {},
    totalPages: 0,
    totalElements: 0,
    last: true,
    numberOfElements: 0,
    size: sizePage,
    number: 0,
    sort: {},
    first: true,
    empty: true,
    details: "cpf_fallback_max_pages_reached",
  };
}

async function fetchBirthdayTodayMonth({ month, day }) {
  const tries = [
    `/partners/birthday-person/today-month/${month}/${day}`,
    `/partners/birthday-person/today-month/${day}/${month}`,
    `/partners/birthday-person/today-month/${day}`,
  ];

  let lastErr = null;

  for (const path of tries) {
    try {
      return await clinicall.request(path, { method: "GET" });
    } catch (e) {
      lastErr = e;
      if (isClinicall404(e)) continue;
      if (isClinicall500(e)) throw e;
      throw e;
    }
  }

  throw lastErr;
}

/**
 * SEARCH
 * Upstream: POST /partners/patient/search
 */
router.post("/search", async (req, res, next) => {
  try {
    const argumentRaw = req.body?.argument ?? "";
    const payload = {
      argument: argumentRaw,
      page: req.body?.page ?? 0,
      sizePage: req.body?.sizePage ?? 25,
      fieldSort: req.body?.fieldSort ?? "name",
      sortDirection: req.body?.sortDirection ?? "asc",
    };

    // 1) tenta normal (rápido)
    const data = await clinicall.request("/partners/patient/search", {
      method: "POST",
      body: payload,
    });

    // 2) se parece CPF e voltou vazio, faz fallback varrendo e filtrando
    const content = Array.isArray(data?.content) ? data.content : [];
    const cpfDigits = onlyDigits(argumentRaw);

    if (looksLikeCpf(argumentRaw) && content.length === 0) {
      const fallback = await searchPatientByCpfFallback({
        cpfDigits,
        sizePage: payload.sizePage,
        fieldSort: payload.fieldSort,
        sortDirection: payload.sortDirection,
      });

      return res.json({ ok: true, data: fallback, meta: { usedCpfFallback: true } });
    }

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * CREATE
 * Upstream: POST /partners/patient
 */
router.post("/", async (req, res, next) => {
  try {
    const data = await clinicall.request("/partners/patient", {
      method: "POST",
      body: req.body,
    });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * GET by id
 * Upstream: GET /partners/patient/:patientId
 */
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = await clinicall.request(`/partners/patient/${id}`, {
      method: "GET",
    });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * UPDATE
 * Upstream: PUT /partners/patient/:patientId
 */
router.put("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = await clinicall.request(`/partners/patient/${id}`, {
      method: "PUT",
      body: req.body,
    });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE
 * Upstream: DELETE /partners/patient/:patientId
 */
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = await clinicall.request(`/partners/patient/${id}`, {
      method: "DELETE",
    });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /patients/birthday/today-month/:month/:day
 * - Retorna 502 limpo quando Clinicall dá SYSTEM_EXCEPTION
 */
router.get("/birthday/today-month/:month/:day", async (req, res, next) => {
  try {
    const { month, day } = req.params;

    try {
      const data = await fetchBirthdayTodayMonth({ month, day });
      return res.json({ ok: true, data });
    } catch (e) {
      if (isClinicall500(e)) {
        return res.status(502).json({
          ok: false,
          error: "clinicall_birthday_unstable",
          details:
            "Clinicall retornou SYSTEM_EXCEPTION para birthday-person. Endpoint instável no tenant.",
        });
      }
      throw e;
    }
  } catch (err) {
    next(err);
  }
});

/**
 * GET /patients/birthday/today-month/:day
 */
router.get("/birthday/today-month/:day", async (req, res, next) => {
  try {
    const { day } = req.params;

    try {
      const data = await fetchBirthdayTodayMonth({ month: "0", day });
      return res.json({ ok: true, data });
    } catch (e) {
      if (isClinicall500(e)) {
        return res.status(502).json({
          ok: false,
          error: "clinicall_birthday_unstable",
          details:
            "Clinicall retornou SYSTEM_EXCEPTION para birthday-person. Endpoint instável no tenant.",
        });
      }
      throw e;
    }
  } catch (err) {
    next(err);
  }
});

export default router;
