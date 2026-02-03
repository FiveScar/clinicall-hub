// src/routes/patients.routes.js
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import clinicall from "../clinicall/client.js";

const router = Router();

/**
 * Helper: tenta variações do endpoint de aniversário
 * Ordem:
 * 1) /today-month/:month/:day
 * 2) /today-month/:day/:month
 * 3) /today-month/:day   (mês implícito = atual)  <-- bate com a doc que mostra ".../today-month/day" :contentReference[oaicite:2]{index=2}
 */
async function fetchBirthdayTodayMonth({ month, day }) {
  // 1) month/day
  try {
    return await clinicall.request(
      `/partners/birthday-person/today-month/${month}/${day}`,
      { method: "GET" }
    );
  } catch (e) {
    const msg = e?.message || "";
    if (!msg.includes("404")) throw e;
  }

  // 2) day/month
  try {
    return await clinicall.request(
      `/partners/birthday-person/today-month/${day}/${month}`,
      { method: "GET" }
    );
  } catch (e) {
    const msg = e?.message || "";
    if (!msg.includes("404")) throw e;
  }

  // 3) only day (month = current month on backend)
  return clinicall.request(`/partners/birthday-person/today-month/${day}`, {
    method: "GET",
  });
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
 * body mínimo: { name, cpf, phoneStandart, birthday }
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
 * ✅ GET /patients/birthday/today-month/:month/:day
 * - Mantém sua URL bonita no hub
 * - Internamente faz fallback até achar a rota real do tenant
 */
router.get(
  "/birthday/today-month/:month/:day",
  asyncHandler(async (req, res) => {
    const { month, day } = req.params;

    const data = await fetchBirthdayTodayMonth({ month, day });
    res.json(data);
  })
);

/**
 * ✅ Extra n8n-friendly: GET /patients/birthday/today-month/:day
 * (quando você não quiser passar month; backend usa mês atual)
 */
router.get(
  "/birthday/today-month/:day",
  asyncHandler(async (req, res) => {
    const { day } = req.params;

    // month não usado no fallback final; mas passamos algo para tentar 1/2 e cair no 3
    const data = await fetchBirthdayTodayMonth({ month: "0", day });
    res.json(data);
  })
);

export default router;
