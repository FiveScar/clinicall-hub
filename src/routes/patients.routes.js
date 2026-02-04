// src/routes/patients.routes.js
import { Router } from "express";
import * as clinicallModule from "../clinicall/client.js";
import { normalizePatient } from "../utils/normalize.js";

const clinicall =
  clinicallModule.default ??
  clinicallModule.clinicallRequest ??
  clinicallModule;

const router = Router();

/**
 * Utils
 */
function onlyDigits(v) {
  return String(v ?? "").replace(/\D+/g, "");
}

function normalizeBRPhoneDigits(raw) {
  let d = onlyDigits(raw);

  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) {
    d = d.slice(2);
  }

  return d;
}

function looksLikeBRPhone(raw) {
  const d = normalizeBRPhoneDigits(raw);
  return d.length === 10 || d.length === 11;
}

function buildSearchPayload({
  argument,
  page = 0,
  sizePage = 25,
  fieldSort = "name",
  sortDirection = "asc",
}) {
  return { argument, page, sizePage, fieldSort, sortDirection };
}

async function upstreamPatientSearch(payload) {
  return clinicall.request
    ? clinicall.request("/partners/patient/search", {
        method: "POST",
        body: payload,
      })
    : clinicall("POST", "/partners/patient/search", payload);
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

function buildPatientPayload(input = {}) {
  const { name, cpf, phone, birthdate, ...rest } = input;

  const payload = {
    ...rest,
    name: name ?? rest.name,
    cpf: cpf ?? rest.cpf,
    phoneStandart: rest.phoneStandart ?? phone ?? rest.phone,
    birthDate: rest.birthDate ?? birthdate ?? rest.birthdate,
  };

  return normalizePatient(payload);
}

/**
 * CRUD
 */
router.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = await clinicall.request(`/partners/patient/${id}`, {
      method: "GET",
    });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const payload = buildPatientPayload(req.body ?? {});
    const data = await clinicall.request("/partners/patient", {
      method: "POST",
      body: payload,
    });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const payload = buildPatientPayload({ ...(req.body ?? {}), id });
    const data = await clinicall.request("/partners/patient", {
      method: "PUT",
      body: payload,
    });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = await clinicall.request(`/partners/patient/${id}`, {
      method: "DELETE",
    });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * Birthday passthrough
 */
router.get("/birthday/today-month/:day", async (req, res, next) => {
  try {
    const day = Number(req.params.day);
    const data = await clinicall.request(
      `/partners/patient/birthday/today-month/${day}`,
      { method: "GET" }
    );
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

router.get("/birthday/today-month/:month/:day", async (req, res, next) => {
  try {
    const month = Number(req.params.month);
    const day = Number(req.params.day);
    const data = await clinicall.request(
      `/partners/patient/birthday/today-month/${month}/${day}`,
      { method: "GET" }
    );
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * SEARCH com heurística de telefone
 */
router.post("/search", async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const rawArgument = body.argument ?? "";
    const page = Number.isFinite(body.page) ? body.page : 0;
    const sizePage = Number.isFinite(body.sizePage) ? body.sizePage : 25;
    const fieldSort = body.fieldSort ?? "name";
    const sortDirection = body.sortDirection ?? "asc";

    const defaultPayload = buildSearchPayload({
      argument: rawArgument,
      page,
      sizePage,
      fieldSort,
      sortDirection,
    });

    if (!looksLikeBRPhone(rawArgument)) {
      const data = await upstreamPatientSearch(defaultPayload);
      res.json({ ok: true, data });
      return;
    }

    const phone = normalizeBRPhoneDigits(rawArgument);
    const variations = [];

    if (phone) variations.push(phone);
    if (phone.length >= 9) variations.push(phone.slice(-9));
    if (phone.length >= 8) variations.push(phone.slice(-8));

    for (const v of variations) {
      const payload = buildSearchPayload({
        argument: v,
        page: 0,
        sizePage,
        fieldSort,
        sortDirection,
      });

      const data = await upstreamPatientSearch(payload);

      if (data?.content?.length) {
        res.json({ ok: true, data });
        return;
      }
    }

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
        const itemPhone = normalizeBRPhoneDigits(
          item?.phoneStandart ?? item?.phone ?? ""
        );
        if (itemPhone && itemPhone === phone) found.push(item);
      }

      if (list.length < SCAN_SIZE) break;
      if (found.length) break;
    }

    const dataOut = toPageResult(found, sizePage);
    res.json({ ok: true, data: dataOut });
  } catch (err) {
    next(err);
  }
});

export default router;
