// src/clinicall/client.js
const BASE_URL = (process.env.CLINICALL_BASE_URL || "").trim();
const TENANT_ID = (process.env.CLINICALL_TENANTID || "").trim();

const FIXED_TOKEN = (process.env.CLINICALL_AUTH_TOKEN || "").trim(); // opcional
const LOGIN = (process.env.CLINICALL_LOGIN || "").trim();
const PASSWORD = (process.env.CLINICALL_PASSWORD || "").trim();
const AUTH_PATH = (process.env.CLINICALL_AUTH_PATH || "/authenticate").trim();

const TIMEOUT_MS = Number(process.env.CLINICALL_TIMEOUT_MS || 20000);
const RETRY = Number(process.env.CLINICALL_RETRY || 2);

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

async function fetchWithTimeout(url, init, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
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
  if (TENANT_ID) headers["X-Tenantid"] = TENANT_ID; // clinicall usa esse formato

  const resp = await fetchWithTimeout(url, {
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

async function getAuthToken({ forceReauth = false } = {}) {
  if (FIXED_TOKEN) return safeTrimToken(FIXED_TOKEN);

  if (!forceReauth && cachedToken) {
    if (!cachedTokenExpMs) return cachedToken;
    if (Date.now() < cachedTokenExpMs - 60_000) return cachedToken; // folga 60s
  }

  return authenticate();
}

async function clinicallFetch(method, path, data, { forceReauth = false } = {}) {
  const m = String(method || "GET").toUpperCase();
  const url = joinUrl(BASE_URL, path);

  const token = await getAuthToken({ forceReauth });

  const headers = { "Content-Type": "application/json" };
  if (TENANT_ID) headers["X-Tenantid"] = TENANT_ID;
  if (token) headers["X-Auth-Token"] = token;

  const init = { method: m, headers };
  if (m !== "GET" && m !== "HEAD" && data !== undefined) init.body = JSON.stringify(data);

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

async function requestWithRetry(method, path, data) {
  let lastErr = null;

  for (let attempt = 0; attempt <= RETRY; attempt++) {
    try {
      return await clinicallFetch(method, path, data);
    } catch (err) {
      lastErr = err;

      // se 401, reautentica e tenta 1 vez imediatamente
      if (err?.status === 401) {
        try {
          return await clinicallFetch(method, path, data, { forceReauth: true });
        } catch (e2) {
          lastErr = e2;
        }
      }

      // pequenas falhas transitórias: tenta de novo
      const msg = String(err?.message || "");
      const transient =
        msg.includes("ECONNRESET") ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("fetch failed") ||
        msg.includes("aborted") ||
        err?.status >= 500;

      if (!transient || attempt === RETRY) break;

      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }

  throw lastErr;
}

export default {
  async request(path, opts = {}) {
    const method = (opts.method || "GET").toUpperCase();
    return requestWithRetry(method, path, opts.body);
  },
};
