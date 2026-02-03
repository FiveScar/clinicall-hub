// src/routes/patients.routes.js
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import clinicall from "../clinicall/client.js";

const router = Router();

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

      // 404 -> tenta próxima variação
      if (isClinicall404(e)) continue;

      // 500 -> não adianta tentar variação, a API tá quebrando mesmo
      if (isClinicall500(e)) throw e;

      // qualquer outro erro -> sobe
      throw e;
    }
  }

  throw lastErr;
}

/**
 * POST /patients/search
 */
router.post(
  "/search",
  asyncHandler(async (req, res) => {
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

    res.json(data);
  })
);

/**
 * POST /patients
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const payload = {
      ...req.body,
      name: req.body?.name,
      cpf: req.body?.cpf,
      phoneStandart: req.body?.phoneStandart,
      birthday: req.body?.birthday,
    };

    const data = await clinicall.request("/partners/patient", {
      method: "POST",
      body: payload,
    });

    res.json(data);
  })
);

/**
 * PUT /patients/:patientId
 */
router.put(
  "/:patientId",
  asyncHandler(async (req, res) => {
    const { patientId } = req.params;

    const data = await clinicall.request(`/partners/patient/${patientId}`, {
      method: "PUT",
      body: req.body,
    });

    res.json(data);
  })
);

/**
 * DELETE /patients/:patientId
 */
router.delete(
  "/:patientId",
  asyncHandler(async (req, res) => {
    const { patientId } = req.params;

    const data = await clinicall.request(`/partners/patient/${patientId}`, {
      method: "DELETE",
    });

    res.json(data);
  })
);

/**
 * GET /patients/:patientId
 */
router.get(
  "/:patientId",
  asyncHandler(async (req, res) => {
    const { patientId } = req.params;

    const data = await clinicall.request(`/partners/patient/${patientId}`, {
      method: "GET",
    });

    res.json(data);
  })
);

/**
 * GET /patients/birthday/today-month/:month/:day
 * - mantém sua rota do HUB
 * - retorna 502 limpo quando Clinicall dá SYSTEM_EXCEPTION
 */
router.get(
  "/birthday/today-month/:month/:day",
  asyncHandler(async (req, res) => {
    const { month, day } = req.params;

    try {
      const data = await fetchBirthdayTodayMonth({ month, day });
      return res.json(data);
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
  })
);

/**
 * GET /patients/birthday/today-month/:day
 */
router.get(
  "/birthday/today-month/:day",
  asyncHandler(async (req, res) => {
    const { day } = req.params;

    try {
      const data = await fetchBirthdayTodayMonth({ month: "0", day });
      return res.json(data);
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
  })
);

export default router;
