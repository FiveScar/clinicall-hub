// src/routes/patients.routes.js
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import clinicall from "../clinicall/client.js";

const router = Router();

async function tryGet(path) {
  try {
    return await clinicall.request(path, { method: "GET" });
  } catch (e) {
    throw e;
  }
}

async function fetchBirthdayTodayMonth({ month, day }) {
  // tenta variações 1) month/day 2) day/month 3) only day
  const tries = [
    `/partners/birthday-person/today-month/${month}/${day}`,
    `/partners/birthday-person/today-month/${day}/${month}`,
    `/partners/birthday-person/today-month/${day}`,
  ];

  let lastErr = null;

  for (const p of tries) {
    try {
      return await tryGet(p);
    } catch (e) {
      lastErr = e;

      const msg = e?.message || "";
      // se for 404, tenta próxima variação
      if (msg.includes("404")) continue;

      // se não for 404, para e sobe o erro
      throw e;
    }
  }

  // se todas deram 404, joga o último erro
  throw lastErr;
}

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
 * Birthday endpoint com erro “limpo”.
 */
router.get(
  "/birthday/today-month/:month/:day",
  asyncHandler(async (req, res) => {
    const { month, day } = req.params;

    try {
      const data = await fetchBirthdayTodayMonth({ month, day });
      return res.json(data);
    } catch (e) {
      const msg = e?.message || "";

      // Clinicall 500 -> devolve erro controlado
      if (msg.includes("500") || msg.includes("SYSTEM_EXCEPTION")) {
        return res.status(502).json({
          ok: false,
          error: "Clinicall birthday endpoint is unstable",
          details:
            "Clinicall retornou SYSTEM_EXCEPTION para este endpoint. Consulte o suporte/administrador do sistema Clinicall.",
          clinicall: e?.payload ?? null,
        });
      }

      throw e;
    }
  })
);

router.get(
  "/birthday/today-month/:day",
  asyncHandler(async (req, res) => {
    const { day } = req.params;

    try {
      const data = await fetchBirthdayTodayMonth({ month: "0", day });
      return res.json(data);
    } catch (e) {
      const msg = e?.message || "";

      if (msg.includes("500") || msg.includes("SYSTEM_EXCEPTION")) {
        return res.status(502).json({
          ok: false,
          error: "Clinicall birthday endpoint is unstable",
          details:
            "Clinicall retornou SYSTEM_EXCEPTION para este endpoint. Consulte o suporte/administrador do sistema Clinicall.",
          clinicall: e?.payload ?? null,
        });
      }

      throw e;
    }
  })
);

export default router;
