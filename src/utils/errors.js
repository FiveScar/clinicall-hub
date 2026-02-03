// src/utils/errors.js
import { HttpError } from "../clinicall/client.js";

export function notFound(_req, res) {
  res.status(404).json({ ok: false, error: "Not found" });
}

export function errorHandler(err, _req, res, _next) {
  // erro vindo do Clinicall
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      ok: false,
      error: err.message,
      details: err.details ?? null,
    });
  }

  // fallback
  return res.status(500).json({
    ok: false,
    error: "Internal Server Error",
    details: String(err?.message || err),
  });
}
