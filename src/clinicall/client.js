// src/clinicall/client.js
const BASE_URL = (process.env.CLINICALL_BASE_URL || "").trim(); // ex: https://clinicall-backend-xxx.a.run.app
const AUTH_TOKEN = (process.env.CLINICALL_AUTH_TOKEN || "").trim(); // token fixo ou obtido por login (se você já faz isso em outro lugar)
const TENANT_ID = (process.env.CLINICALL_TENANTID || "").trim(); // se você usa tenant header no clinicall
const REQUEST_TIMEOUT_MS = 9000;
const MAX_RETRIES = 1;
const RETRY_STATUS = new Set([502, 503]);
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "PUT", "DELETE", "OPTIONS"]);

function joinUrl(base, path) {
  const b = String(base || "").replace(/\/+$/, "");
  const p = String(path || "").replace(/^\/+/, "");
  if (!b) throw new Error("Missing CLINICALL_BASE_URL env");
  return `${b}/${p}`;
}

async function readJsonSafe(resp) {
  const text = await resp.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * clinicallRequest(method, path, data?)
 * - method: "GET" | "POST" | "PUT" | "DELETE"
 * - path: "/partners/patient/search" etc
 */
export async function clinicallRequest(method, path, data) {
  const m = String(method || "GET").toUpperCase();

  // URL FINAL É SÓ BASE + PATH (NUNCA encostar method aqui)
  const url = joinUrl(BASE_URL, path);

  const headers = {
    "Content-Type": "application/json",
  };

  // Se você usa Auth-Token no Clinicall
  if (AUTH_TOKEN) headers["X-Auth-Token"] = AUTH_TOKEN;

  // Se você usa Tenant
  if (TENANT_ID) headers["X-Tenantid"] = TENANT_ID;

  const init = {
    method: m,
    headers,
  };

  // body só quando faz sentido
  if (m !== "GET" && m !== "HEAD" && data !== undefined) {
    init.body = JSON.stringify(data);
  }

  const hasIdempotencyKey = Boolean(headers["Idempotency-Key"] || headers["X-Idempotency-Key"]);
  const canRetry = IDEMPOTENT_METHODS.has(m) || hasIdempotencyKey;
  const startTime = Date.now();
  const retryReasons = [];
  let attempt = 0;
  let resp;

  while (true) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      resp = await fetch(url, { ...init, signal: controller.signal });
    } catch (e) {
      const isTimeout = e?.name === "AbortError";
      if (isTimeout && canRetry && attempt < MAX_RETRIES) {
        retryReasons.push("timeout");
        attempt += 1;
        continue;
      }
      const msg = e?.message || String(e);
      throw new Error(`Fetch failed for ${url} :: ${msg}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (RETRY_STATUS.has(resp.status) && canRetry && attempt < MAX_RETRIES) {
      retryReasons.push(`status:${resp.status}`);
      attempt += 1;
      continue;
    }

    break;
  }

  const payload = await readJsonSafe(resp);
  const totalDurationMs = Date.now() - startTime;

  if (!resp.ok) {
    const details = typeof payload === "string" ? payload : JSON.stringify(payload);
    throw new Error(`Clinicall error ${resp.status}: ${resp.statusText} :: ${details}`);
  }

  if (retryReasons.length > 0) {
    const meta = {
      retry: {
        count: retryReasons.length,
        reasons: retryReasons,
      },
      totalDurationMs,
    };

    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      return { ...payload, meta };
    }

    return { data: payload, meta };
  }

  return payload;
}
