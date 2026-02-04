const BASE_URL = (process.env.CLINICALL_BASE_URL || "").trim();
const LOGIN = (process.env.CLINICALL_LOGIN || "").trim();
const PASSWORD = (process.env.CLINICALL_PASSWORD || "").trim();
const STATIC_TOKEN = (process.env.CLINICALL_AUTH_TOKEN || "").trim();

const LOGIN_PATH = (process.env.CLINICALL_AUTH_LOGIN_PATH || "/auth/login").trim();
const LOGIN_METHOD = (process.env.CLINICALL_AUTH_LOGIN_METHOD || "POST").trim();
const REFRESH_PATH = (process.env.CLINICALL_AUTH_REFRESH_PATH || "/auth/refresh").trim();
const REFRESH_METHOD = (process.env.CLINICALL_AUTH_REFRESH_METHOD || "POST").trim();

const LOGIN_FIELD = (process.env.CLINICALL_AUTH_LOGIN_FIELD || "login").trim();
const PASSWORD_FIELD = (process.env.CLINICALL_AUTH_PASSWORD_FIELD || "password").trim();

const DEFAULT_TTL_MS = Number(process.env.CLINICALL_AUTH_TTL_MS)
  || Number(process.env.CLINICALL_AUTH_TTL_SEC) * 1000
  || 25 * 60 * 1000;
const REFRESH_SKEW_MS = Number(process.env.CLINICALL_AUTH_REFRESH_SKEW_MS)
  || Number(process.env.CLINICALL_AUTH_REFRESH_SKEW_SEC) * 1000
  || 60 * 1000;

const sessionCache = {
  token: null,
  refreshToken: null,
  expiresAt: 0,
  refreshAt: 0,
};

let pendingAuth = null;

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

function resolveExpiry(payload) {
  if (!payload || typeof payload !== "object") return null;

  const expAt = payload.expiresAt ?? payload.expires_at;
  if (expAt) {
    const parsed = typeof expAt === "string" ? Date.parse(expAt) : Number(expAt);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  const expIn = payload.expiresIn ?? payload.expires_in ?? payload.ttl ?? payload.expires;
  if (expIn !== undefined) {
    const value = Number(expIn);
    if (Number.isFinite(value) && value > 0) {
      if (value > 10_000_000_000) return value;
      if (value > 10_000_000) return value * 1000;
      return Date.now() + value * 1000;
    }
  }

  return null;
}

function extractSession(resp, payload, fallbackToken) {
  const headerToken = resp.headers.get("x-auth-token");
  const token =
    headerToken
    || payload?.token
    || payload?.access_token
    || payload?.authToken
    || payload?.sessionToken
    || fallbackToken;

  if (!token) {
    throw new Error("Auth response did not include token");
  }

  const refreshToken =
    payload?.refresh_token
    || payload?.refreshToken
    || payload?.refresh;

  const expiresAt = resolveExpiry(payload) || Date.now() + DEFAULT_TTL_MS;
  const refreshAt = Math.max(expiresAt - REFRESH_SKEW_MS, Date.now() + 1000);

  return {
    token,
    refreshToken,
    expiresAt,
    refreshAt,
  };
}

function setSession(session) {
  sessionCache.token = session.token;
  sessionCache.refreshToken = session.refreshToken || null;
  sessionCache.expiresAt = session.expiresAt;
  sessionCache.refreshAt = session.refreshAt;
}

function buildLoginBody() {
  if (!LOGIN || !PASSWORD) {
    throw new Error("Missing CLINICALL_LOGIN/CLINICALL_PASSWORD envs");
  }

  return {
    [LOGIN_FIELD]: LOGIN,
    [PASSWORD_FIELD]: PASSWORD,
  };
}

async function requestAuth(path, method, body, extraHeaders = {}) {
  const url = joinUrl(BASE_URL, path);
  const init = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const resp = await fetch(url, init);
  const payload = await readJsonSafe(resp);

  if (!resp.ok) {
    const details = typeof payload === "string" ? payload : JSON.stringify(payload);
    throw new Error(`Clinicall auth error ${resp.status}: ${resp.statusText} :: ${details}`);
  }

  return { resp, payload };
}

async function login() {
  const { resp, payload } = await requestAuth(LOGIN_PATH, LOGIN_METHOD, buildLoginBody());
  const session = extractSession(resp, payload);
  setSession(session);
  return session.token;
}

async function refresh() {
  const headers = {};
  if (sessionCache.token) headers["X-Auth-Token"] = sessionCache.token;

  const body = sessionCache.refreshToken ? { refreshToken: sessionCache.refreshToken } : undefined;
  const { resp, payload } = await requestAuth(REFRESH_PATH, REFRESH_METHOD, body, headers);
  const session = extractSession(resp, payload, sessionCache.token);
  setSession(session);
  return session.token;
}

export async function getAuthToken() {
  if (STATIC_TOKEN) return STATIC_TOKEN;

  const now = Date.now();
  if (sessionCache.token && now < sessionCache.refreshAt) {
    return sessionCache.token;
  }

  if (pendingAuth) return pendingAuth;

  pendingAuth = (async () => {
    try {
      if (sessionCache.token) {
        try {
          return await refresh();
        } catch {
          return await login();
        }
      }
      return await login();
    } finally {
      pendingAuth = null;
    }
  })();

  return pendingAuth;
}

export function clearAuthSession() {
  sessionCache.token = null;
  sessionCache.refreshToken = null;
  sessionCache.expiresAt = 0;
  sessionCache.refreshAt = 0;
}
