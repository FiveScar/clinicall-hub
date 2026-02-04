// src/utils/errors.js
import { HttpError } from "../clinicall/client.js";

const STATUS_MAP = {
  400: { code: "VALIDATION_ERROR", message: "Dados inválidos." },
  404: { code: "NOT_FOUND", message: "Recurso não encontrado." },
  409: { code: "SCHEDULE_CONFLICT", message: "Horário indisponível." },
  500: { code: "INTERNAL_ERROR", message: "Erro interno." },
  502: { code: "CRM_ERROR", message: "Erro no CRM." },
};

function mapError(status) {
  return STATUS_MAP[status] || STATUS_MAP[500];
}

export function notFound(_req, res) {
  const mapped = mapError(404);
  res.status(404).json({
    ok: false,
    error: { status: 404, ...mapped },
  });
}

export function errorHandler(err, req, res, _next) {
  const status = err instanceof HttpError ? err.status : 500;
  const mapped = mapError(status);

  // erro vindo do Clinicall
  return res.status(status).json({
    ok: false,
    error: { status, ...mapped },
    requestId: req?.requestId,
  });
}
