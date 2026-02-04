import { getAuthToken } from "./auth.js";

// src/clinicall/client.js
const BASE_URL = (process.env.CLINICALL_BASE_URL || "").trim(); // ex: https://clinicall-backend-xxx.a.run.app
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
  return request(path, { method, body: data });
}

export async function request(path, options = {}) {
  const m = String(options.method || "GET").toUpperCase();

  // URL FINAL É SÓ BASE + PATH (NUNCA encostar method aqui)
  const url = joinUrl(BASE_URL, path);

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const token = await getAuthToken();
  if (token) headers["X-Auth-Token"] = token;

  if (TENANT_ID) headers["X-Tenantid"] = TENANT_ID;

  const init = {
    method: m,
    headers,
  };

  const body = options.body ?? options.data;
  if (m !== "GET" && m !== "HEAD" && body !== undefined) {
    init.body = JSON.stringify(body);
  }

  let resp;
  try {
    resp = await fetch(url, init);
  } catch (e) {
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

export default {
  request,
};
