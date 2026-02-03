// src/routes/patients.routes.js
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import clinicall from "../clinicall/client.js";

const router = Router();

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

/**
 * FIX: ordem correta = day/month
 */
router.get(
  "/birthday/today-month/:month/:day",
  asyncHandler(async (req, res) => {
    const { month, day } = req.params;

    const data = await clinicall.request(
      `/partners/birthday-person/today-month/${day}/${month}`,
      { method: "GET" }
    );

    res.json(data);
  })
);

export default router;
