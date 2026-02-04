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
    const payload = {
      argument: req.body?.argument ?? "",
      page: req.body?.page ?? 0,
      sizePage: req.body?.sizePage ?? 25,
      fieldSort: req.body?.fieldSort ?? "name",
      sortDirection: req.body?.sortDirection ?? "asc",
    };

    const data = await clinicall.request("/partners/patient/search", {
      method: "POST",
      body: payload,
    });

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
          details: "Clinicall retornou SYSTEM_EXCEPTION para birthday-person. Endpoint instável no tenant.",
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
          details: "Clinicall retornou SYSTEM_EXCEPTION para birthday-person. Endpoint instável no tenant.",
        });
      }
      throw e;
    }
  } catch (err) {
    next(err);
  }
});

export default router;