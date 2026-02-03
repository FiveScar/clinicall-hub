// src/clinicall/client.js
const BASE_URL =
  process.env.CLINICALL_BASE_URL ||
  "https://clinicall-backend-rcbqj2mecq-rj.a.run.app";

const TENANTID = process.env.CLINICALL_TENANTID;
const LOGIN = process.env.CLINICALL_LOGIN;
const PASSWORD = process.env.CLINICALL_PASSWORD;

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

export async function authenticate() {
  assertEnv();

  const url = `${BASE_URL}/authenticate`;

  const resp = await fetch(url, {
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
  });

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
    const resp = await fetch(url, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        "X-Auth-Token": tokenToUse,
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    return resp;
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
const clinicall = {
  authenticate,
  getToken,
  request: clinicallRequest,
};

export default clinicall;
