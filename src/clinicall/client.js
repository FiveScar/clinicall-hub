// src/clinicall/client.js
const BASE_URL = (process.env.CLINICALL_BASE_URL || "").trim(); // ex: https://clinicall-backend-xxx.a.run.app
const AUTH_TOKEN = (process.env.CLINICALL_AUTH_TOKEN || "").trim(); // token fixo ou obtido por login (se você já faz isso em outro lugar)
const TENANT_ID = (process.env.CLINICALL_TENANTID || "").trim(); // se você usa tenant header no clinicall

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

/**
 * clinicallRequest(method, path, data?)
 * - method: "GET" | "POST" | "PUT" | "DELETE"
 * - path: "/partners/patient/search" etc
 */
export async function clinicallRequest(method, path, data) {
  const m = String(method || "GET").toUpperCase();

  // URL FINAL É SÓ BASE + PATH (NUNCA encostar method aqui)
  const url = joinUrl(BASE_URL, path);

  const headers = {
    "Content-Type": "application/json",
  };

  // Se você usa Auth-Token no Clinicall
  if (AUTH_TOKEN) headers["X-Auth-Token"] = AUTH_TOKEN;

  // Se você usa Tenant
  if (TENANT_ID) headers["X-Tenantid"] = TENANT_ID;

  const init = {
    method: m,
    headers,
  };

  // body só quando faz sentido
  if (m !== "GET" && m !== "HEAD" && data !== undefined) {
    init.body = JSON.stringify(data);
  }

  let resp;
  try {
    resp = await fetch(url, init);
  } catch (e) {
    // Aqui pega exatamente esse ENOTFOUND e devolve claro
    const msg = e?.message || String(e);
    throw new Error(`Fetch failed for ${url} :: ${msg}`);
  }

  const payload = await readJsonSafe(resp);

  if (!resp.ok) {
    const details = typeof payload === "string" ? payload : JSON.stringify(payload);
    throw new Error(`Clinicall error ${resp.status}: ${resp.statusText} :: ${details}`);
  }

  return payload;
}
