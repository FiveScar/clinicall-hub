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
    p?.phoneStandart, // clinicall vem assim em alguns tenants
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

const PREFIXES_ENV = (process.env.CLINICALL_INDEX_PREFIXES || "").trim();
// padrão macro: letras + números + Ç
const DEFAULT_PREFIXES = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
  ..."0123456789".split(""),
  "Ç",
];

let index = new Map(); // phoneDigits -> { id, name, updatedAt }
let isLoaded = false;
let isBuilding = false;
let lastBuildAt = null;
let lastBuildStats = { scanned: 0, indexed: 0, prefixes: 0 };

async function ensureDir() {
  await fs.mkdir(INDEX_DIR, { recursive: true });
}

async function loadFromDisk() {
  if (isLoaded) return;

  await ensureDir();

  try {
    const raw = await fs.readFile(INDEX_PATH, "utf-8");
    const obj = JSON.parse(raw);

    index = new Map();
    for (const [k, v] of Object.entries(obj?.data || {})) {
      index.set(k, v);
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
  const dataObj = Object.fromEntries(index.entries());
  const payload = {
    meta: {
      lastBuildAt,
      stats: lastBuildStats,
      ...metaExtra,
    },
    data: dataObj,
  };
  await fs.writeFile(INDEX_PATH, JSON.stringify(payload), "utf-8");
}

export async function getByPhone(rawPhone) {
  await loadFromDisk();

  const digits = normalizeBRPhoneDigits(rawPhone);
  if (!looksLikeBRPhone(digits)) return null;

  return index.get(digits) || null;
}

export async function upsertPatient(p) {
  await loadFromDisk();

  const phones = extractPhoneDigitsFromPatient(p);
  if (!phones.length) return 0;

  let added = 0;
  const rec = {
    id: p?.id ?? null,
    name: p?.name ?? "",
    updatedAt: new Date().toISOString(),
  };

  for (const ph of phones) {
    if (!looksLikeBRPhone(ph)) continue;
    index.set(ph, rec);
    added++;
  }

  return added;
}

function getPrefixes() {
  if (!PREFIXES_ENV) return DEFAULT_PREFIXES;
  // exemplo: "A,B,C,0,1,Ç"
  return PREFIXES_ENV
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function scanPrefix(prefix) {
  let scanned = 0;
  let indexed = 0;

  for (let page = 0; page < MAX_PAGES_PER_PREFIX; page++) {
    const body = {
      argument: prefix,
      page,
      sizePage: PAGE_SIZE,
      fieldSort: "name",
      sortDirection: "asc",
    };

    const r = await clinicall.request("/partners/patient/search", { method: "POST", body });
    const content = Array.isArray(r?.content) ? r.content : [];

    if (page === 0) {
      console.log(`[patientIndex] prefix="${prefix}" page=0 count=${content.length}`);
    }

    if (!content.length) break;

    scanned += content.length;

    for (const p of content) {
      indexed += await upsertPatient(p);
    }
  }

  return { scanned, indexed };
}

export async function rebuildIndex() {
  await loadFromDisk();
  if (isBuilding) return { started: false, reason: "already_building" };

  isBuilding = true;
  lastBuildStats = { scanned: 0, indexed: 0, prefixes: 0 };

  const prefixes = getPrefixes();
  lastBuildStats.prefixes = prefixes.length;

  try {
    console.log(`[patientIndex] rebuild started prefixes=${prefixes.length}`);
    for (const pref of prefixes) {
      const s = await scanPrefix(pref);
      lastBuildStats.scanned += s.scanned;
      lastBuildStats.indexed += s.indexed;

      // salva a cada prefixo (persistência forte)
      lastBuildAt = new Date().toISOString();
      await saveToDisk();
    }

    console.log(
      `[patientIndex] rebuild finished scanned=${lastBuildStats.scanned} indexed=${lastBuildStats.indexed}`
    );

    return { started: true, ok: true, stats: lastBuildStats };
  } finally {
    isBuilding = false;
  }
}

// dispara rebuild sem travar request
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
    countPhones: index.size,
    indexPath: INDEX_PATH,
  };
}

// warmup leve: garante carregado e, se ainda não tiver build, inicia async
export async function warmupIfEmpty() {
  await loadFromDisk();
  if (!lastBuildAt && !isBuilding) {
    rebuildIndexAsync();
  }
}
