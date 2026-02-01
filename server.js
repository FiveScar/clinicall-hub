import express from "express";

const app = express();
app.use(express.json());

// ====== Config ======
const BASE_URL =
  process.env.CLINICALL_BASE_URL || "https://clinicall-backend-rcbqj2mecq-rj.a.run.app";

const TENANTID = process.env.CLINICALL_TENANTID; // ex: institutosonoemente
const LOGIN = process.env.CLINICALL_LOGIN;       // ex: iaqueatende
const PASSWORD = process.env.CLINICALL_PASSWORD; // ex: Iaqueatende123

// ====== Token cache em memória ======
let cachedToken = null;
let tokenCreatedAt = null;

// ====== Helpers ======
function mask(v) {
  if (!v) return null;
  if (v.length <= 4) return "****";
  return `${v.slice(0, 2)}****${v.slice(-2)}`;
}

async function authenticate() {
  if (!TENANTID || !LOGIN || !PASSWORD) {
    throw new Error(
      `Missing env vars. Need: CLINICALL_TENANTID, CLINICALL_LOGIN, CLINICALL_PASSWORD`
    );
  }

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

  const text = await resp.text().catch(() => "");
  if (!resp.ok) {
    // devolve o corpo pra debug (sem vazar senha)
    throw new Error(`Auth failed: ${resp.status} ${resp.statusText} ${text}`);
  }

  const token = resp.headers.get("x-auth-token");
  if (!token) {
    throw new Error(`Auth OK but x-auth-token missing. Body: ${text}`);
  }

  cachedToken = token;
  tokenCreatedAt = new Date().toISOString();
  return token;
}

async function getToken() {
  if (cachedToken) return cachedToken;
  return authenticate();
}

// ====== Endpoints do HUB ======
app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "clinicall-hub",
    endpoints: ["/health", "/internal/env", "/internal/token"],
  });
});

app.get("/health", (_req, res) => res.json({ ok: true, service: "clinicall-hub" }));

// debug: confirma se o Coolify carregou as env vars
app.get("/internal/env", (_req, res) => {
  res.json({
    ok: true,
    BASE_URL,
    CLINICALL_TENANTID: mask(TENANTID),
    CLINICALL_LOGIN: mask(LOGIN),
    CLINICALL_PASSWORD: PASSWORD ? "****(set)" : null,
  });
});

// tenta autenticar e mostra preview do token
app.get("/internal/token", async (_req, res) => {
  try {
    const token = await getToken();
    res.json({
      ok: true,
      tokenPreview: token.slice(0, 20) + "...",
      tokenCreatedAt,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`API running on ${PORT}`));
