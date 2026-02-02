import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { clinicallRequest } from "../clinicall/client.js";

const router = Router();

/**
 * POST /patients/search
 * body: { argument, page, sizePage, fieldSort, sortDirection }
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

    const data = await clinicallRequest("/partners/patient/search", {
      method: "POST",
      body: payload,
    });

    res.json(data);
  })
);

/**
 * POST /patients
 * Cria paciente
 * Obrigatórios (docs): name, cpf, phoneStandart, birthday
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

    const data = await clinicallRequest("/partners/patient", {
      method: "POST",
      body: payload,
    });

    res.json(data);
  })
);

/**
 * GET /patients/:patientId
 * Busca paciente por ID
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
 * PUT /patients/:patientId
 * Atualiza paciente por ID
 */
router.put(
  "/:patientId",
  asyncHandler(async (req, res) => {
    const { patientId } = req.params;

    const data = await clinicallRequest(`/partners/patient/${patientId}`, {
      method: "PUT",
      body: { ...req.body },
    });

    res.json(data);
  })
);

/**
 * DELETE /patients/:patientId
 * Remove paciente por ID
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

/**
 * GET /patients/birthday/:month/:day
 * Aniversariantes (rota da Clinicall):
 * /partners/birthday-person/today-month/:month/:day
 */
router.get(
  "/birthday/:month/:day",
  asyncHandler(async (req, res) => {
    const { month, day } = req.params;

    const data = await clinicallRequest(
      `/partners/birthday-person/today-month/${month}/${day}`,
      { method: "GET" }
    );

    res.json(data);
  })
);

export default router;
