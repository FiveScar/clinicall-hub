// src/clinicall/client.js
/**
 * Clinicall HTTP client
 * - Autentica automaticamente via CLINICALL_AUTH_PATH (default: /authenticate)
 * - Armazena token em memória (por instância)
 * - Em 401, reautentica e tenta 1x novamente
 * - Suporta import default (clinicall.request) E named export (clinicallRequest)
 */

const BASE_URL = String(process.env.CLINICALL_BASE_URL || "").trim();
const TENANT_ID = String(process.env.CLINICALL_TENANTID || "").trim();
const LOGIN = String(process.env.CLINICALL_LOGIN || "").trim();
const PASSWORD = String(process.env.CLINICALL_PASSWORD || "").trim();
const AUTH_PATH = String(process.env.CLINICALL_AUTH_PATH || "/authenticate").trim(); // ex: /authenticate
const TIMEOUT_MS = Number(process.env.CLINICALL_TIMEOUT_MS || 20000);
const RETRY = Number(process.env.CLINICALL_RETRY || 2);

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

function makeTenantHeaders() {
  const h = {};
  if (TENANT_ID) h["X-Tenantid"] = TENANT_ID;
  return h;
}

let _authToken = "";
let _authTokenAt = 0;

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(t);
  }
}

function buildClinicallError(resp, payload) {
  const details = typeof payload === "string" ? payload : JSON.stringify(payload);
  const err = new Error(`Clinicall error ${resp.status}: ${resp.statusText} :: ${details}`);
  err.status = resp.status;
  err.payload = payload;

  // ✅ Normalização BFF: muitos "403" do Clinicall são regra/validação (não auth)
  // Ex: "Id do Convênio não informado", "Formulário inválido..."
  const msg = typeof payload === "object" && payload ? String(payload.message || "") : "";
  const code = typeof payload === "object" && payload ? String(payload.code || "") : "";

  if (resp.status === 403 && (code === "APPLICATION_EXCEPTION" || msg)) {
    err.public = true;
    err.status = 400; // trata como validação/domínio
    err.code = "VALIDATION_ERROR";
    err.publicMessage = msg || "Dados inválidos, verifique os campos.";
    err.details = payload;
  }

  if (resp.status === 404) {
    err.public = true;
    err.status = 502;
    err.code = "UPSTREAM_NOT_FOUND";
    err.publicMessage = "Serviço do CRM não encontrou o recurso.";
    err.details = payload;
  }

  return err;
}

async function doFetchJson(method, path, body, extraHeaders = {}) {
  const url = joinUrl(BASE_URL, path);

  const headers = {
    "Content-Type": "application/json",
    ...makeTenantHeaders(),
    ...extraHeaders,
  };

  const init = { method, headers };

  if (method !== "GET" && method !== "HEAD" && body !== undefined) {
    init.body = JSON.stringify(body);
  }

  let lastErr;
  const tries = Math.max(1, RETRY + 1);

  for (let i = 0; i < tries; i++) {
    try {
      const resp = await fetchWithTimeout(url, init);
      const payload = await readJsonSafe(resp);

      if (!resp.ok) {
        throw buildClinicallError(resp, payload);
      }

      return { resp, payload };
    } catch (e) {
      lastErr = e;

      const status = e?.status;
      const msg = String(e?.message || "");
      const transient =
        status === 502 ||
        status === 503 ||
        status === 504 ||
        msg.includes("aborted") ||
        msg.includes("Fetch failed") ||
        msg.includes("network");

      if (!transient || i === tries - 1) break;
      await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }

  throw lastErr || new Error("Clinicall fetch failed");
}

async function authenticate(force = false) {
  if (!LOGIN || !PASSWORD) throw new Error("Missing CLINICALL_LOGIN/CLINICALL_PASSWORD env");
  if (_authToken && !force) return _authToken;

  const { resp, payload } = await doFetchJson("POST", AUTH_PATH, { login: LOGIN, password: PASSWORD }, {});

  const token = resp.headers.get("x-auth-token") || resp.headers.get("X-Auth-Token") || "";
  if (!token) {
    throw new Error(`Clinicall auth ok sem x-auth-token header :: ${JSON.stringify(payload)}`);
  }

  _authToken = token.trim().replace(/^<|>$/g, "");
  _authTokenAt = Date.now();
  return _authToken;
}

/**
 * request(path, { method, body, headers })
 */
async function request(path, opts = {}) {
  const method = String(opts.method || "GET").toUpperCase();
  const body = opts.body;
  const headers = { ...(opts.headers || {}) };

  const token = await authenticate(false);
  headers["X-Auth-Token"] = token;

  try {
    const { payload } = await doFetchJson(method, path, body, headers);
    return payload;
  } catch (e) {
    if (e?.status === 401) {
      const token2 = await authenticate(true);
      headers["X-Auth-Token"] = token2;
      const { payload } = await doFetchJson(method, path, body, headers);
      return payload;
    }
    throw e;
  }
}

/**
 * Named export compatível com imports antigos:
 * clinicallRequest(method, path, data?)
 */
export async function clinicallRequest(method, path, data) {
  return request(path, { method, body: data });
}

const clinicall = { request, authenticate };
export default clinicall;
