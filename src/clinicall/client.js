// src/clinicall/client.js

const BASE_URL = (process.env.CLINICALL_BASE_URL || "").trim();
const TENANT_ID = (process.env.CLINICALL_TENANTID || "").trim();
const LOGIN = (process.env.CLINICALL_LOGIN || "").trim();
const PASSWORD = (process.env.CLINICALL_PASSWORD || "").trim();

// conforme doc: POST /authenticate
const AUTH_PATH = (process.env.CLINICALL_AUTH_PATH || "/authenticate").trim();

// timeout padrão
const TIMEOUT_MS = Number(process.env.CLINICALL_TIMEOUT_MS || 15000);

// cache em memória
let cachedToken = "";
let authInFlight = null;

function joinUrl(base, path) {
  const b = String(base || "").replace(/\/+$/, "");
  const p = String(path || "").replace(/^\/+/, "");
  if (!b) throw new Error("Missing CLINICALL_BASE_URL env");
  return `${b}/${p}`;
}

function assertAuthEnv() {
  if (!BASE_URL) throw new Error("Missing CLINICALL_BASE_URL env");
  if (!TENANT_ID) throw new Error("Missing CLINICALL_TENANTID env");
  if (!LOGIN) throw new Error("Missing CLINICALL_LOGIN env");
  if (!PASSWORD) throw new Error("Missing CLINICALL_PASSWORD env");
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

async function fetchWithTimeout(url, init, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function authenticate() {
  assertAuthEnv();

  const url = joinUrl(BASE_URL, AUTH_PATH);

  const resp = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenantid": TENANT_ID, // doc usa X-Tenantid
    },
    body: JSON.stringify({
      login: LOGIN,
      password: PASSWORD,
    }),
  });

  const payload = await readJsonSafe(resp);

  if (!resp.ok) {
    const details = typeof payload === "string" ? payload : JSON.stringify(payload);
    throw new Error(`Clinicall auth error ${resp.status}: ${resp.statusText} :: ${details}`);
  }

  const token =
    resp.headers.get("x-auth-token") ||
    resp.headers.get("X-Auth-Token") ||
    resp.headers.get("authorization") ||
    resp.headers.get("Authorization");

  if (!token) {
    throw new Error(
      "Clinicall auth succeeded but x-auth-token header was not present (expected token in response headers)"
    );
  }

  cachedToken = token.trim();
  return cachedToken;
}

async function getToken() {
  // token em cache
  if (cachedToken) return cachedToken;

  // evita várias autenticações simultâneas
  if (authInFlight) return authInFlight;

  authInFlight = authenticate().finally(() => {
    authInFlight = null;
  });

  return authInFlight;
}

async function clinicallFetch(method, path, data, { forceReauth = false } = {}) {
  assertAuthEnv();

  if (forceReauth) cachedToken = "";

  const token = await getToken();

  const m = String(method || "GET").toUpperCase();
  const url = joinUrl(BASE_URL, path);

  const headers = {
    "Content-Type": "application/json",
    "X-Auth-Token": token,
    "X-Tenantid": TENANT_ID,
  };

  const init = { method: m, headers };

  if (m !== "GET" && m !== "HEAD" && data !== undefined) {
    init.body = JSON.stringify(data);
  }

  const resp = await fetchWithTimeout(url, init);
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

// compatibilidade: usado nas rotas
export async function clinicallRequest(method, path, data) {
  try {
    return await clinicallFetch(method, path, data);
  } catch (err) {
    // se 401, reautentica e tenta 1 vez
    if (err?.status === 401 || String(err?.message || "").includes(" 401:")) {
      return clinicallFetch(method, path, data, { forceReauth: true });
    }
    throw err;
  }
}

// compatibilidade com import default (clinicall.request)
export default {
  async request(path, opts = {}) {
    const method = (opts.method || "GET").toUpperCase();
    return clinicallRequest(method, path, opts.body);
  },
};
