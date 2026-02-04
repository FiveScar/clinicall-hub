// src/utils/errors.js
import { HttpError } from "../clinicall/client.js";
import { fail } from "./response.js";

export function notFound(_req, res) {
  return fail(res, null, {
    status: 404,
    message: "Não encontrado",
    code: "NOT_FOUND",
  });
}

export function errorHandler(err, _req, res, _next) {
  // erro vindo do Clinicall
  if (err instanceof HttpError) {
    return fail(res, null, {
      status: err.status,
      message: "Erro no CRM",
      code: "CRM_ERROR",
      meta: { details: err.details ?? null },
    });
  }

  // fallback
  return fail(res, null, {
    status: 500,
    message: "Erro interno",
    code: "INTERNAL_ERROR",
    meta: { details: String(err?.message || err) },
  });
}
