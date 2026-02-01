import express from "express";

const app = express();
app.use(express.json());

// ====== Config ======
const BASE_URL = process.env.CLINICALL_BASE_URL || "https://clinicall-backend-rcbqj2mecq-rj.a.run.app";
const TENANTID = process.env.CLINICALL_TENANTID; // ex: 
const LOGIN = process.env.CLINICALL_LOGIN;       // ex: 
const PASSWORD = process.env.CLINICALL_PASSWORD; // ex: 

if (!TENANTID || !LOGIN || !PASSWORD) {
  console.warn("[WARN] Missing env vars: CLINICALL_TENANTID / CLINICALL_LOGIN / CLINICALL_PASSWORD");
}

// ====== Token cache em memória ======
let cachedToken = null;
let tokenCreatedAt = null;

// ====== Auth ======
async function authenticate() {
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

  // token vem no header: x-auth-token
  const token = resp.headers.get("x-auth-token");
  if (!token) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Auth succeeded but x-auth-token missing. Body: ${body}`);
  }

  cachedToken = token;
  tokenCreatedAt = new Date().toISOString();
  return token;
}

async function getToken() {
  // Se já tem token, reutiliza.
  // (Sem expiração declarada, a gente depende do 401 pra reauth)
  if (cachedToken) return cachedToken;
  return authenticate();
}

// ====== Cliente HTTP com retry ======
async function clinicallRequest(path, { method = "GET", body, headers = {} } = {}) {
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

    // Se token expirou, tenta reauth 1x
    if (resp.status === 401) return { resp, unauthorized: true };
    return { resp, unauthorized: false };
  };

  let { resp, unauthorized } = await doFetch(token);

  if (unauthorized) {
    cachedToken = null;
    const newToken = await authenticate();
    const retry = await doFetch(newToken);
    resp = retry.resp;

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
    throw new Error(`Clinicall error ${resp.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }

  return data;
}

// ====== Endpoints do HUB ======
app.get("/health", (_req, res) => res.json({ ok: true, service: "clinicall-hub" }));

// endpoint só pra você testar se o token está vindo
app.get("/internal/token", async (_req, res) => {
  try {
    const token = await getToken();
    res.json({ ok: true, tokenPreview: token.slice(0, 20) + "...", tokenCreatedAt });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// placeholder: próximo é paciente
// app.post("/patients/search", async (req, res) => { ... })

const PORT = process.env.PORT || 3333;
app.listen(PORT, "0.0.0.0", () => console.log(`API running on ${PORT}`));
