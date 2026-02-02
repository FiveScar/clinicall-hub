const BASE_URL = process.env.CLINICALL_BASE_URL || "https://clinicall-backend-rcbqj2mecq-rj.a.run.app";
const TENANTID = process.env.CLINICALL_TENANTID;
const LOGIN = process.env.CLINICALL_LOGIN;
const PASSWORD = process.env.CLINICALL_PASSWORD;

let cachedToken = null;
let tokenCreatedAt = null;

function assertEnv() {
  if (!TENANTID || !LOGIN || !PASSWORD) {
    throw new Error("Missing env vars: CLINICALL_TENANTID / CLINICALL_LOGIN / CLINICALL_PASSWORD");
  }
}

export function getTokenMeta() {
  return { tokenCreatedAt };
}

export async function authenticate() {
  assertEnv();

  const resp = await fetch(`${BASE_URL}/authenticate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenantid": TENANTID,
    },
    body: JSON.stringify({ login: LOGIN, password: PASSWORD, userRtv: null }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Auth failed: ${resp.status} ${resp.statusText} ${text}`);
  }

  const token = resp.headers.get("x-auth-token");
  if (!token) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Auth ok but x-auth-token missing. Body: ${body}`);
  }

  cachedToken = token;
  tokenCreatedAt = new Date().toISOString();
  return token;
}

export async function getToken() {
  if (cachedToken) return cachedToken;
  return authenticate();
}

export async function clinicallRequest(path, { method = "GET", body, headers = {} } = {}) {
  const url = `${BASE_URL}${path}`;
  const token = await getToken();

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

  let resp = await doFetch(token);

  if (resp.status === 401) {
    cachedToken = null;
    const newToken = await authenticate();
    resp = await doFetch(newToken);
  }

  const contentType = resp.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await resp.json() : await resp.text();

  if (!resp.ok) {
    throw new Error(`Clinicall error ${resp.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }

  return data;
}
