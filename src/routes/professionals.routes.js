// src/routes/professionals.routes.js
import express from "express";
import * as clinicallModule from "../clinicall/client.js";

const clinicall = clinicallModule.default ?? clinicallModule;

const router = express.Router();

function normalizeProfessional(professional = {}) {
  return {
    id: professional.id ?? professional.performerId ?? professional.professionalId ?? null,
    name: professional.name ?? professional.fullName ?? professional.performerName ?? "",
    speciality:
      professional.speciality ??
      professional.specialty ??
      professional.specialization ??
      professional.specialityName ??
      null,
    active: professional.active ?? professional.enabled ?? professional.isActive ?? null,
  };
}

function normalizeProfessionalResponse(data) {
  if (Array.isArray(data)) {
    return data.map(normalizeProfessional);
  }

  if (data?.content && Array.isArray(data.content)) {
    return { ...data, content: data.content.map(normalizeProfessional) };
  }

  if (data && typeof data === "object") {
    return normalizeProfessional(data);
  }

  return data;
}

router.post("/search", async (req, res, next) => {
  try {
    const data = await clinicall.request("/partners/performer/search", {
      method: "POST",
      body: req.body,
    });
    res.json({ ok: true, data: normalizeProfessionalResponse(data) });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const data = await clinicall.request(`/partners/performer/${req.params.id}`, {
      method: "GET",
    });
    res.json({ ok: true, data: normalizeProfessionalResponse(data) });
  } catch (err) {
    next(err);
  }
});

export default router;
