// src/index/patientIndex.js
import fs from "fs/promises";
import path from "path";
import clinicall from "../clinicall/client.js";

function onlyDigits(v) {
  return String(v ?? "").replace(/\D+/g, "");
}

function normalizeBRPhoneDigits(raw) {
  let d = onlyDigits(raw);
  // remove DDI 55 se vier
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  return d;
}

function looksLikeBRPhone(digits) {
  return digits.length === 10 || digits.length === 11;
}

function extractPhoneDigitsFromPatient(p) {
  const candidates = [
    p?.phoneStandart, // alguns tenants usam esse nome
    p?.phoneStandard,
    p?.phone,
    p?.cellphone,
    p?.telephone,
    p?.mobile,
    p?.whatsapp,
  ].filter(Boolean);

  return candidates.map(normalizeBRPhoneDigits).filter(Boolean);
}

const INDEX_PATH = (process.env.CLINICALL_INDEX_PATH || "/app/data/patientIndex.json").trim();
const INDEX_DIR = path.dirname(INDEX_PATH);

const PAGE_SIZE = Number(process.env.CLINICALL_INDEX_PAGE_SIZE || 100);
const MAX_PAGES_PER_PREFIX = Number(process.env.CLINICALL_INDEX_MAX_PAGES || 200);

// Você pode limitar pra testar rápido, ex:
// CLINICALL_INDEX_PREFIXES=J
// CLINICALL_INDEX_PREFIXES=A,B,C,0,1,Ç
const PREFIXES_ENV = (process.env.CLINICALL_INDEX_PREFIXES || "").trim();

// padrão macro: letras + números + Ç
const DEFAULT_PREFIXES = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
  ..."0123456789".split(""),
  "Ç",
];

let phoneIndex = new Map(); // phoneDigits -> { id, name, cpf, updatedAt }
let cpfIndex = new Map();   // cpfDigits   -> { id, name, cpf, updatedAt }
let isLoaded = false;
let isBuilding = false;
let lastBuildAt = null;
let lastBuildStats = { scanned: 0, indexed: 0, prefixes: 0, prefix: null, page: 0 };

async function ensureDir() {
  await fs.mkdir(INDEX_DIR, { recursive: true });
}

async function loadFromDisk() {
  if (isLoaded) return;

  await ensureDir();

  try {
    const raw = await fs.readFile(INDEX_PATH, "utf-8");
    const obj = JSON.parse(raw);

    phoneIndex = new Map();
    cpfIndex = new Map();

    // Backward compat:
    // - versões antigas salvavam apenas obj.data (phones)
    // - versão nova salva obj.dataPhones e obj.dataCpf
    const dataPhones = obj?.dataPhones || obj?.data || {};
    const dataCpf = obj?.dataCpf || {};

    for (const [k, v] of Object.entries(dataPhones)) {
      const key = normalizeBRPhoneDigits(k);
      if (key) phoneIndex.set(key, v);
    }
    for (const [k, v] of Object.entries(dataCpf)) {
      const key = onlyDigits(k);
      if (key) cpfIndex.set(key, v);
    }

    lastBuildAt = obj?.meta?.lastBuildAt || null;
    lastBuildStats = obj?.meta?.stats || lastBuildStats;
  } catch {
    // sem arquivo ainda
  } finally {
    isLoaded = true;
  }
}

async function saveToDisk(metaExtra = {}) {
  await ensureDir();
  const dataPhones = Object.fromEntries(phoneIndex.entries());
  const dataCpf = Object.fromEntries(cpfIndex.entries());

  const payload = {
    meta: {
      lastBuildAt,
      stats: lastBuildStats,
      ...metaExtra,
    },
    dataPhones,
    dataCpf,
  };

  await fs.writeFile(INDEX_PATH, JSON.stringify(payload), "utf-8");
}

export async function getByPhone(rawPhone) {
  await loadFromDisk();

  const digits = normalizeBRPhoneDigits(rawPhone);
  if (!looksLikeBRPhone(digits)) return null;

  return phoneIndex.get(digits) || null;
}

export async function getByCpf(rawCpf) {
  await loadFromDisk();

  const digits = onlyDigits(rawCpf);
  if (digits.length !== 11) return null;

  return cpfIndex.get(digits) || null;
}

export async function upsertPatient(p) {
  await loadFromDisk();

  const rec = {
    id: p?.id ?? null,
    name: p?.name ?? "",
    cpf: onlyDigits(p?.cpf ?? ""),
    updatedAt: new Date().toISOString(),
  };

  let added = 0;

  // CPF index
  if (rec.cpf && rec.cpf.length === 11) {
    cpfIndex.set(rec.cpf, rec);
    added += 1;
  }

  // Phone index
  const phones = extractPhoneDigitsFromPatient(p);
  for (const ph of phones) {
    if (!looksLikeBRPhone(ph)) continue;
    phoneIndex.set(ph, rec);
    added += 1;
  }

  return added;
}

function getPrefixes() {
  if (!PREFIXES_ENV) return DEFAULT_PREFIXES;
  return PREFIXES_ENV
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function scanPrefix(prefix) {
  let scannedLocal = 0;
  let indexedLocal = 0;

  for (let page = 0; page < MAX_PAGES_PER_PREFIX; page++) {
    lastBuildStats.prefix = prefix;
    lastBuildStats.page = page;

    const body = {
      argument: prefix,
      page,
      sizePage: PAGE_SIZE,
      fieldSort: "name",
      sortDirection: "asc",
    };

    // ✅ chamada CRM
    const r = await clinicall.request("/partners/patient/search", { method: "POST", body });
    const content = Array.isArray(r?.content) ? r.content : [];

    if (!content.length) break;

    // ✅ progresso em tempo real (global e local)
    scannedLocal += content.length;
    lastBuildStats.scanned += content.length;

    for (const p of content) {
      const inc = await upsertPatient(p);
      indexedLocal += inc;
      lastBuildStats.indexed += inc;
    }

    // ✅ salva parcial a cada 5 páginas (e atualiza lastBuildAt)
    if (page % 5 === 0) {
      lastBuildAt = new Date().toISOString();
      await saveToDisk();
    }
  }

  return { scannedLocal, indexedLocal };
}

export async function rebuildIndex() {
  await loadFromDisk();
  if (isBuilding) return { started: false, reason: "already_building" };

  isBuilding = true;
  lastBuildStats = { scanned: 0, indexed: 0, prefixes: 0, prefix: null, page: 0 };

  const prefixes = getPrefixes();
  lastBuildStats.prefixes = prefixes.length;

  try {
    console.log(`[patientIndex] rebuild started prefixes=${prefixes.length}`);

    for (const pref of prefixes) {
      await scanPrefix(pref);

      // ✅ checkpoint por prefixo
      lastBuildAt = new Date().toISOString();
      await saveToDisk();
    }

    console.log(
      `[patientIndex] rebuild finished scanned=${lastBuildStats.scanned} indexed=${lastBuildStats.indexed} phones=${phoneIndex.size} cpf=${cpfIndex.size}`
    );

    return { started: true, ok: true, stats: lastBuildStats };
  } finally {
    isBuilding = false;
    // salva final
    lastBuildAt = new Date().toISOString();
    await saveToDisk();
  }
}

export async function rebuildIndexAsync() {
  rebuildIndex().catch((e) => console.error("[patientIndex] rebuild error:", e?.message || e));
}

export async function status() {
  await loadFromDisk();
  return {
    ok: true,
    isBuilding,
    lastBuildAt,
    stats: lastBuildStats,
    countPhones: phoneIndex.size,
    countCpf: cpfIndex.size,
    indexPath: INDEX_PATH,
  };
}

export async function warmupIfEmpty() {
  await loadFromDisk();
  if (!lastBuildAt && !isBuilding) {
    rebuildIndexAsync();
  }
}
