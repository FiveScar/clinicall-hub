import express from "express";

const app = express();
app.use(express.json());

// ====== Config ======
const BASE_URL = process.env.CLINICALL_BASE_URL || "https://clinicall-backend-rcbqj2mecq-rj.a.run.app";
const TENANTID = process.env.CLINICALL_TENANTID;
const LOGIN = process.env.CLINICALL_LOGIN;
const PASSWORD = process.env.CLINICALL_PASSWORD;

if (!TENANTID || !LOGIN || !PASSWORD) {
  console.warn("[WARN] Missing env vars: CLINICALL_TENANTID / CLINICALL_LOGIN / CLINICALL_PASSWORD");
}

// ====== Token cache ======
let cachedToken = null;
let tokenCreatedAt = null;

// ====== Auth ======
async function authenticate() {
  const resp = await fetch(`${BASE_URL}/authenticate`, {
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
    const text = await resp.text();
    throw new Error(`Auth failed: ${resp.status} ${text}`);
  }

  const token = resp.headers.get("x-auth-token");
  if (!token) {
    throw new Error("Auth OK but x-auth-token not found");
  }

  cachedToken = token;
  tokenCreatedAt = new Date().toISOString();
  return token;
}

async function getToken() {
  if (cachedToken) return cachedToken;
  return authenticate();
}

// ====== Clinicall Request Wrapper ======
async function clinicallRequest(path, options = {}) {
  const token = await getToken();

  const resp = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      "X-Auth-Token": token,
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (resp.status === 401) {
    cachedToken = null;
    const newToken = await authenticate();

    return clinicallRequest(path, {
      ...options,
      headers: { "X-Auth-Token": newToken },
    });
  }

  const data = await resp.json();

  if (!resp.ok) {
    throw new Error(JSON.stringify(data));
  }

  return data;
}

// ====== Endpoints ======
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "clinicall-hub" });
});

app.get("/internal/token", async (_req, res) => {
  try {
    const token = await getToken();
    res.json({
      ok: true,
      tokenPreview: token.slice(0, 20) + "...",
      tokenCreatedAt,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ====== Server ======
const PORT = process.env.PORT || 3333;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`Clinicall Hub running on port ${PORT}`)
);
