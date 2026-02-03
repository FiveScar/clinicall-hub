// src/routes/patients.routes.js
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import clinicall from "../clinicall/client.js";

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

    const data = await clinicall.request("/partners/patient/search", {
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

    const data = await clinicall.request(`/partners/patient/${patientId}`, {
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
      // manda tudo que vier, mas garante os obrigatórios abaixo
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

    const payload = {
      ...req.body,
    };

    const data = await clinicall.request(`/partners/patient/${patientId}`, {
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

    const data = await clinicall.request(`/partners/patient/${patientId}`, {
      method: "DELETE",
    });

    res.json(data);
  })
);

/**
 * GET /patients/birthday/today-month/:month/:day
 * Clinicall: GET /partners/birthday-person/today-month/:month/:day
 */
router.get(
  "/birthday/today-month/:month/:day",
  asyncHandler(async (req, res) => {
    const { month, day } = req.params;

    const data = await clinicall.request(
      `/partners/birthday-person/today-month/${month}/${day}`,
      { method: "GET" }
    );

    res.json(data);
  })
);

export default router;
