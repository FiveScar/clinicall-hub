// src/clinicall/client.js
const BASE_URL = (process.env.CLINICALL_BASE_URL || "").trim();
const TENANT_ID = (process.env.CLINICALL_TENANTID || "").trim();

const FIXED_TOKEN = (process.env.CLINICALL_AUTH_TOKEN || "").trim(); // opcional
const LOGIN = (process.env.CLINICALL_LOGIN || "").trim();
const PASSWORD = (process.env.CLINICALL_PASSWORD || "").trim();
const AUTH_PATH = (process.env.CLINICALL_AUTH_PATH || "/authenticate").trim();

function joinUrl(base, path) {
  const b = String(base || "").replace(/\/+$/, "");
  const p = String(path || "").replace(/^\/+/, "");
  if (!b) throw new Error("Missing CLINICALL_BASE_URL env");
  return `${b}/${p}`;
}

function safeTrimToken(t) {
  return String(t || "").trim().replace(/^<|>$/g, "").replace(/^"|"$/g, "");
}

function decodeJwtExp(token) {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (typeof payload?.exp === "number") return payload.exp * 1000;
    return null;
  } catch {
    return null;
  }
}

async function readText(resp) {
  try {
    return await resp.text();
  } catch {
    return "";
  }
}

async function readJsonSafe(resp) {
  const text = await readText(resp);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

let cachedToken = null;
let cachedTokenExpMs = null;

async function authenticate() {
  if (!LOGIN || !PASSWORD) {
    throw new Error("Missing CLINICALL_LOGIN/CLINICALL_PASSWORD env for auto-auth");
  }

  const url = joinUrl(BASE_URL, AUTH_PATH);
  const headers = { "Content-Type": "application/json" };
  if (TENANT_ID) {
    headers["X-Tenantid"] = TENANT_ID;
    headers["X-TenantId"] = TENANT_ID;
    headers["X-TenantID"] = TENANT_ID;
  }

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ login: LOGIN, password: PASSWORD }),
  });

  const payload = await readJsonSafe(resp);

  if (!resp.ok) {
    const details = typeof payload === "string" ? payload : JSON.stringify(payload);
    throw new Error(`Clinicall auth error ${resp.status}: ${resp.statusText} :: ${details}`);
  }

  const token = safeTrimToken(resp.headers.get("x-auth-token"));
  if (!token) throw new Error("Clinicall auth succeeded but x-auth-token header is missing");

  cachedToken = token;
  cachedTokenExpMs = decodeJwtExp(token);
  return token;
}

async function getAuthToken() {
  if (FIXED_TOKEN) return safeTrimToken(FIXED_TOKEN);

  // se tem cache e ainda não expirou (com folga de 60s), reutiliza
  if (cachedToken) {
    if (!cachedTokenExpMs) return cachedToken;
    if (Date.now() < cachedTokenExpMs - 60_000) return cachedToken;
  }

  return authenticate();
}

/**
 * clinicallRequest(method, path, data?)
 * - method: "GET" | "POST" | "PUT" | "DELETE"
 * - path: "/partners/patient/search" etc
 */
export async function clinicallRequest(method, path, data) {
  const m = String(method || "GET").toUpperCase();
  const url = joinUrl(BASE_URL, path);

  const headers = { "Content-Type": "application/json" };

  // tenant
  if (TENANT_ID) {
    headers["X-Tenantid"] = TENANT_ID;
    headers["X-TenantId"] = TENANT_ID;
    headers["X-TenantID"] = TENANT_ID;
  }

  // auth
  const token = await getAuthToken();
  if (token) headers["X-Auth-Token"] = token;

  const init = { method: m, headers };

  if (m !== "GET" && m !== "HEAD" && data !== undefined) {
    init.body = JSON.stringify(data);
  }

  let resp;
  try {
    resp = await fetch(url, init);
  } catch (e) {
    const msg = e?.message || String(e);
    throw new Error(`Fetch failed for ${url} :: ${msg}`);
  }

  // retry 1x em 401 (token expirou)
  if (resp.status === 401 && !FIXED_TOKEN) {
    cachedToken = null;
    cachedTokenExpMs = null;

    const retryToken = await getAuthToken();
    init.headers["X-Auth-Token"] = retryToken;

    resp = await fetch(url, init);
  }

  const payload = await readJsonSafe(resp);

  if (!resp.ok) {
    const details = typeof payload === "string" ? payload : JSON.stringify(payload);
    throw new Error(`Clinicall error ${resp.status}: ${resp.statusText} :: ${details}`);
  }

  return payload;
}

/**
 * Compatibilidade: clinicall.request(path, { method, body })
 * - usado pelas rotas antigas que importam default
 */
const clinicall = {
  async request(path, { method = "GET", body } = {}) {
    return clinicallRequest(method, path, body);
  },
};

export default clinicall;
