// src/utils/response.js
export function buildMeta(req, extra = {}) {
  return {
    requestId: req?.requestId,
    ...extra,
  };
}

export function ok(res, req, data, meta) {
  return res.json({
    ok: true,
    data,
    error: null,
    meta: buildMeta(req, meta),
  });
}

export function fail(res, req, { status = 500, message, code, meta } = {}) {
  return res.status(status).json({
    ok: false,
    data: null,
    error: message,
    meta: buildMeta(req, { ...meta, code }),
  });
}
