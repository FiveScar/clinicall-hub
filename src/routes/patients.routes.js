import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { clinicallRequest } from "../clinicall/client.js";

const router = Router();

/**
 * POST /patients/search
 */
router.post(
  "/search",
  asyncHandler(async (req, res) => {
    const payload = {
      argument: req.body.argument ?? "",
      page: req.body.page ?? 0,
      sizePage: req.body.sizePage ?? 25,
      fieldSort: req.body.fieldSort ?? "name",
      sortDirection: req.body.sortDirection ?? "asc",
    };

    const data = await clinicallRequest("/partners/patient/search", {
      method: "POST",
      body: payload,
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

    const data = await clinicallRequest(`/partners/patient/${patientId}`, {
      method: "GET",
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
      name: req.body.name,
      cpf: req.body.cpf,
      phoneStandart: req.body.phoneStandart,
      birthday: req.body.birthday,
    };

    const data = await clinicallRequest("/partners/patient", {
      method: "POST",
      body: payload,
    });

    res.json(data);
  })
);

/**
 * PUT /patients/:patientId
 * Observação: na documentação “real” aparece PUT em /partners/patient com o id no body.
 * Então aqui a gente adapta.
 */
router.put(
  "/:patientId",
  asyncHandler(async (req, res) => {
    const { patientId } = req.params;

    const payload = {
      ...req.body,
      id: Number(patientId),
    };

    const data = await clinicallRequest("/partners/patient", {
      method: "PUT",
      body: payload,
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

    const data = await clinicallRequest(`/partners/patient/${patientId}`, {
      method: "DELETE",
    });

    res.json(data);
  })
);

export default router;
