// src/clinicall/client.js

const BASE_URL = (process.env.CLINICALL_BASE_URL || "").trim();
const AUTH_TOKEN = (process.env.CLINICALL_AUTH_TOKEN || "").trim();
const TENANT_ID = (process.env.CLINICALL_TENANTID || "").trim();

function joinUrl(base, path) {
  const b = String(base || "").replace(/\/+$/, "");
  const p = String(path || "").replace(/^\/+/, "");
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

function assertEnv() {
  if (!BASE_URL) throw new Error("Missing CLINICALL_BASE_URL env");
  if (!AUTH_TOKEN) throw new Error("Missing CLINICALL_AUTH_TOKEN env");
}

async function doFetch(method, path, data) {
  assertEnv();

  const m = String(method || "GET").toUpperCase();
  const url = joinUrl(BASE_URL, path);

  const headers = {
    "Content-Type": "application/json",
    "X-Auth-Token": AUTH_TOKEN,
  };

  if (TENANT_ID) headers["X-Tenantid"] = TENANT_ID;

  const init = { method: m, headers };

  if (m !== "GET" && m !== "HEAD" && data !== undefined) {
    init.body = JSON.stringify(data);
  }

  const resp = await fetch(url, init);
  const payload = await readJsonSafe(resp);

  if (!resp.ok) {
    const details = typeof payload === "string" ? payload : JSON.stringify(payload);
    throw new Error(`Clinicall error ${resp.status}: ${resp.statusText} :: ${details}`);
  }

  return payload;
}

export async function clinicallRequest(method, path, data) {
  return doFetch(method, path, data);
}

export default {
  async request(path, opts = {}) {
    const method = (opts.method || "GET").toUpperCase();
    return clinicallRequest(method, path, opts.body);
  },
};
