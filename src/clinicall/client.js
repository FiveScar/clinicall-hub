// src/clinicall/client.js
const BASE_URL = (process.env.CLINICALL_BASE_URL || "").trim();
const TENANT_ID = (process.env.CLINICALL_TENANTID || "").trim();

// Se você ainda quiser suportar token fixo via env (opcional)
const STATIC_AUTH_TOKEN = (process.env.CLINICALL_AUTH_TOKEN || "").trim();

// Credenciais para login automático
const LOGIN = (process.env.CLINICALL_LOGIN || "").trim();
const PASSWORD = (process.env.CLINICALL_PASSWORD || "").trim();

// Endpoint de login (ajustável). Defaults baseados no seu contexto (/auth/login)
const AUTH_PATH = (process.env.CLINICALL_AUTH_PATH || "/auth/login").trim();

// Timeout padrão (ms)
const TIMEOUT_MS = Number(process.env.CLINICALL_TIMEOUT_MS || 15000);

// Cache em memória
let cachedToken = STATIC_AUTH_TOKEN || "";
let tokenUpdatedAt = 0;

// Trava para evitar várias autenticações concorrentes
let authInFlight = null;

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

function pickTokenFromResponse(resp, payload) {
  // Clinicall costuma devolver em header x-auth-token
  const headerToken =
    resp.headers.get("x-auth-token") ||
    resp.headers.get("X-Auth-Token") ||
    resp.headers.get("authorization") ||
    resp.headers.get("Authorization");

  if (headerToken) {
    // Se vier "Bearer xxx", extrai só o token
    const m = headerToken.match(/bearer\s+(.+)/i);
    return (m?.[1] || headerToken).trim();
  }

  // Fallback: tenta achar em body
  if (payload && typeof payload === "object") {
    const bodyToken =
      payload.token ||
      payload.authToken ||
      payload.accessToken ||
      payload["x-auth-token"] ||
      payload["X-Auth-Token"];

    if (bodyToken) return String(bodyToken).trim();
  }

  return "";
}

async function fetchWithTimeout(url, init, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(t);
  }
}

async function authenticate() {
  if (!LOGIN || !PASSWORD) {
    throw new Error(
      "Missing CLINICALL_LOGIN / CLINICALL_PASSWORD env (needed for auto token renewal)"
    );
  }

  const url = joinUrl(BASE_URL, AUTH_PATH);

  const headers = { "Content-Type": "application/json" };
  if (TENANT_ID) headers["X-Tenantid"] = TENANT_ID;

  // Body baseado no seu exemplo do Postman
  const body = {
    login: LOGIN,
    userRtv: null,
    password: PASSWORD,
  };

  const resp = await fetchWithTimeout(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const payload = await readJsonSafe(resp);

  if (!resp.ok) {
    const details = typeof payload === "string" ? payload : JSON.stringify(payload);
    throw new Error(`Clinicall auth error ${resp.status}: ${resp.statusText} :: ${details}`);
  }

  const token = pickTokenFromResponse(resp, payload);

  if (!token) {
    throw new Error(
      "Clinicall auth succeeded but token was not found in headers/body (expected x-auth-token or token fields)"
    );
  }

  cachedToken = token;
  tokenUpdatedAt = Date.now();
  return token;
}

async function getValidToken() {
  // Se já tem um token cacheado (estático ou previamente autenticado), usa
  if (cachedToken) return cachedToken;

  // Se já tem auth em andamento, aguarda
  if (authInFlight) return authInFlight;

  // Senão, dispara autenticação e guarda a Promise
  authInFlight = authenticate().finally(() => {
    authInFlight = null;
  });

  return authInFlight;
}

async function doClinicallFetch(method, path, data, { forceReauth = false } = {}) {
  const m = String(method || "GET").toUpperCase();
  const url = joinUrl(BASE_URL, path);

  const headers = { "Content-Type": "application/json" };
  if (TENANT_ID) headers["X-Tenantid"] = TENANT_ID;

  // se pediram reauth, limpa token e pega outro
  if (forceReauth) cachedToken = "";

  // tenta garantir token (se não existir, faz login)
  const token = await getValidToken();
  if (token) headers["X-Auth-Token"] = token;

  const init = { method: m, headers };

  if (m !== "GET" && m !== "HEAD" && data !== undefined) {
    init.body = JSON.stringify(data);
  }

  let resp;
  try {
    resp = await fetchWithTimeout(url, init);
  } catch (e) {
    const msg = e?.name === "AbortError" ? "Request timeout" : (e?.message || String(e));
    throw new Error(`Fetch failed for ${url} :: ${msg}`);
  }

  const payload = await readJsonSafe(resp);

  if (!resp.ok) {
    const details = typeof payload === "string" ? payload : JSON.stringify(payload);
    const err = new Error(`Clinicall error ${resp.status}: ${resp.statusText} :: ${details}`);
    err.status = resp.status;
    err.payload = payload;
    throw err;
  }

  return payload;
}

/**
 * clinicallRequest(method, path, data?)
 * - compatível com seu código atual
 * - auto-login se token faltar
 * - auto-renova se der 401 e repete 1x
 */
export async function clinicallRequest(method, path, data) {
  try {
    return await doClinicallFetch(method, path, data);
  } catch (err) {
    // Se 401, renova token e tenta novamente 1 vez
    if (err?.status === 401 || String(err?.message || "").includes(" 401:")) {
      // limpa token e força reauth
      try {
        return await doClinicallFetch(method, path, data, { forceReauth: true });
      } catch (err2) {
        throw err2;
      }
    }
    throw err;
  }
}

/**
 * Default export para rotas que fazem:
 * import clinicall from "../clinicall/client.js";
 * clinicall.request("/path", { method, body })
 */
export default {
  async request(path, opts = {}) {
    const method = (opts.method || "GET").toUpperCase();
    const body = opts.body;
    return clinicallRequest(method, path, body);
  },
};
