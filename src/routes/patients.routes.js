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
function toId(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
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

function buildPatientPayload(input = {}) {
  // A Clinicall valida campos strict.
  // Padronizamos para o que a API realmente espera:
  // birthday, genderId, civilStatusId, insuranceId, address.cityId, address.addressTypeId
  const payload = {};

  const id = input.id ?? input.patientId;
  if (id != null) payload.id = id;

  payload.name = input.name ?? "";
  payload.cpf = input.cpf ?? undefined;
  payload.birthday = input.birthday ?? input.birthDate ?? input.birthdate ?? undefined;
  payload.phoneStandart = input.phoneStandart ?? input.phone ?? undefined;

  // ids planos
  const genderId = toId(input.genderId ?? input.gender?.id);
  if (genderId) payload.genderId = genderId;

  const civilStatusId = toId(input.civilStatusId ?? input.civilStatus?.id);
  if (civilStatusId) payload.civilStatusId = civilStatusId;

  const insuranceId = toId(input.insuranceId ?? input.insurance?.id);
  if (insuranceId) payload.insuranceId = insuranceId;

  const companyId = toId(input.companyId);
  if (companyId) payload.companyId = companyId;

  if (input.active !== undefined) payload.active = Boolean(input.active);
  if (input.mother !== undefined) payload.mother = input.mother;
  if (input.email !== undefined) payload.email = input.email;
  if (input.identity !== undefined) payload.identity = input.identity;

  if (input.address) {
    const a = input.address;
    const addressTypeId = toId(a.addressTypeId ?? a.addressType?.id);
    const cityId = toId(a.cityId ?? a.city?.id);
    const countryId = toId(a.countryId) ?? 1;
    payload.address = {
      address: a.address,
      district: a.district,
      zipcode: a.zipcode,
      description: a.description,
      addon: a.addon,
      number: a.number,
      addressTypeId,
      cityId,
      countryId,
    };
  }

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
 * SEARCH (SEM telefone)
 * A Clinicall não tem endpoint de busca por telefone.
 * Logo: busca é exclusivamente por CPF ou nome via /partners/patient/search.
 */
router.post("/search", async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const argument = body.argument ?? "";
    const page = Number.isFinite(body.page) ? body.page : 0;
    const sizePage = Number.isFinite(body.sizePage) ? body.sizePage : 25;
    const fieldSort = body.fieldSort ?? "name";
    const sortDirection = body.sortDirection ?? "asc";

    const payload = buildSearchPayload({
      argument,
      page,
      sizePage,
      fieldSort,
      sortDirection,
    });

    const data = await upstreamPatientSearch(payload);
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
