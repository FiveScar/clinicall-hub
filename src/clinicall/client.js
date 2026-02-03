// src/clinicall/client.js

const BASE_URL =
  process.env.CLINICALL_BASE_URL ||
  "https://clinicall-backend-rcbqj2mecq-rj.a.run.app";

const TENANTID = process.env.CLINICALL_TENANTID;
const LOGIN = process.env.CLINICALL_LOGIN;
const PASSWORD = process.env.CLINICALL_PASSWORD;

// timeout padrão (ms). Pode ajustar se precisar.
const DEFAULT_TIMEOUT_MS = Number(process.env.CLINICALL_TIMEOUT_MS || 15000);

function assertEnv() {
  if (!TENANTID || !LOGIN || !PASSWORD) {
    throw new Error(
      "Missing env vars: CLINICALL_TENANTID / CLINICALL_LOGIN / CLINICALL_PASSWORD"
    );
  }
}

// cache simples em memória
let cachedToken = null;
let tokenCreatedAt = null;

export function getTokenMeta() {
  return { tokenCreatedAt };
}

// helper: fetch com timeout + erro mais claro
async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    return resp;
  } catch (err) {
    // deixa o erro MUITO mais fácil de entender
    const causeMsg = err?.cause?.message ? ` :: ${err.cause.message}` : "";
    const msg =
      err?.name === "AbortError"
        ? `Request timed out after ${timeoutMs}ms`
        : err?.message || String(err);

    throw new Error(`Fetch failed for ${url} :: ${msg}${causeMsg}`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function authenticate() {
  assertEnv();

  const url = `${BASE_URL}/authenticate`;

  const resp = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenantid": TENANTID,
      },
      body: JSON.stringify({
        login: LOGIN,
        password: PASSWORD,
        userRtv: null,
      }),
    },
    DEFAULT_TIMEOUT_MS
  );

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Auth failed: ${resp.status} ${resp.statusText} ${text}`);
  }

  const token = resp.headers.get("x-auth-token");
  if (!token) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Auth ok, but x-auth-token missing. Body: ${body}`);
  }

  cachedToken = token;
  tokenCreatedAt = new Date().toISOString();
  return token;
}

export async function getToken() {
  // sem expiração declarada -> reutiliza e reautentica só se tomar 401
  if (cachedToken) return cachedToken;
  return authenticate();
}

export async function clinicallRequest(
  path,
  { method = "GET", body, headers = {} } = {}
) {
  const url = `${BASE_URL}${path}`;

  const doFetch = async (tokenToUse) => {
    return fetchWithTimeout(
      url,
      {
        method,
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          "X-Auth-Token": tokenToUse,
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      },
      DEFAULT_TIMEOUT_MS
    );
  };

  let token = await getToken();
  let resp = await doFetch(token);

  // reauth 1x se 401
  if (resp.status === 401) {
    cachedToken = null;
    token = await authenticate();
    resp = await doFetch(token);

    if (resp.status === 401) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Unauthorized even after reauth. ${text}`);
    }
  }

  const contentType = resp.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await resp.json()
    : await resp.text();

  if (!resp.ok) {
    throw new Error(
      `Clinicall error ${resp.status}: ${
        typeof data === "string" ? data : JSON.stringify(data)
      }`
    );
  }

  return data;
}

// ✅ default export compatível com as rotas
const clinicall = {
  authenticate,
  getToken,
  request: clinicallRequest,
};

export default clinicall;
