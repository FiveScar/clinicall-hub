import express from "express";

const app = express();
app.use(express.json());

// ====== Config ======
const BASE_URL =
  process.env.CLINICALL_BASE_URL ||
  "https://clinicall-backend-rcbqj2mecq-rj.a.run.app";

const TENANTID = process.env.CLINICALL_TENANTID;
const LOGIN = process.env.CLINICALL_LOGIN;
const PASSWORD = process.env.CLINICALL_PASSWORD;

if (!TENANTID || !LOGIN || !PASSWORD) {
  console.warn(
    "[WARN] Missing env vars: CLINICALL_TENANTID / CLINICALL_LOGIN / CLINICALL_PASSWORD"
  );
}

// ====== Token cache (memória) ======
let cachedToken = null;
let tokenCreatedAt = null;

// ====== Auth ======
async function authenticate() {
  const url = `${BASE_URL}/authenticate`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // IMPORTANTÍSSIMO: tenant no header
      "X-Tenantid": TENANTID,
    },
    body: JSON.stringify({
      login: LOGIN,
      password: PASSWORD,
      userRtv: null,
    }),
  });

  // Se deu erro, captura body pra log
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `Auth failed: ${resp.status} ${resp.statusText} :: ${text}`
    );
  }

  // token vem no header: x-auth-token
  const token = resp.headers.get("x-auth-token");
  if (!token) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Auth OK but x-auth-token missing. Body: ${body}`);
  }

  cachedToken = token;
  tokenCreatedAt = new Date().toISOString();
  return token;
}

async function getToken() {
  if (cachedToken) return cachedToken;
  return authenticate();
}

// ====== Cliente com retry 401 ======
async function clinicallRequest(
  path,
  { method = "GET", body, headers = {} } = {}
) {
  const url = `${BASE_URL}${path}`;
  let token = await getToken();

  async function doFetch(tokenToUse) {
    const resp = await fetch(url, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        "X-Auth-Token": tokenToUse,
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (resp.status === 401) return { resp, unauthorized: true };
    return { resp, unauthorized: false };
  }

  let { resp, unauthorized } = await doFetch(token);

  if (unauthorized) {
    cachedToken = null;
    token = await authenticate();
    const retry = await doFetch(token);
    resp = retry.resp;

    if (resp.status === 401) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Unauthorized even after reauth: ${text}`);
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

// ====== Rotas do HUB ======
app.get("/", (_req, res) =>
  res.json({ ok: true, service: "clinicall-hub", hint: "use /health" })
);

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "clinicall-hub" })
);

// Para testar no browser (GET) e também via POST
app.get("/auth", async (_req, res) => {
  try {
    const token = await authenticate();
    res.json({ ok: true, tokenPreview: token.slice(0, 20) + "...", tokenCreatedAt });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.post("/auth", async (_req, res) => {
  try {
    const token = await authenticate();
    res.json({ ok: true, tokenPreview: token.slice(0, 20) + "...", tokenCreatedAt });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get("/internal/token", async (_req, res) => {
  try {
    const token = await getToken();
    res.json({ ok: true, tokenPreview: token.slice(0, 20) + "...", tokenCreatedAt });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Próximo: paciente (a gente pluga jájá)
// app.post("/patients/search", async (req, res) => { ... })

// ====== Patients ======
// HUB: POST /patients/search
// Clinicall: POST /partners/patient/search
app.post("/patients/search", async (req, res) => {
  try {
    // aceita o body como você mandar no Postman
    const {
      argument = "",
      page = 0,
      sizePage = 25,
      fieldSort = "name",
      sortDirection = "asc",
    } = req.body || {};

    // Normaliza valores básicos
    const payload = {
      argument: String(argument ?? ""),
      page: Number.isFinite(Number(page)) ? Number(page) : 0,
      sizePage: Number.isFinite(Number(sizePage)) ? Number(sizePage) : 25,
      fieldSort: String(fieldSort ?? "name"),
      sortDirection: String(sortDirection ?? "asc"),
    };

    const data = await clinicallRequest("/partners/patient/search", {
      method: "POST",
      body: payload,
    });

    return res.json(data);
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: String(e?.message || e),
    });
  }
});


const PORT = process.env.PORT || 3333;
app.listen(PORT, "0.0.0.0", () => console.log(`API running on ${PORT}`));
