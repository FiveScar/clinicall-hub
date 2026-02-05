// src/utils/semanticResolve.js

// 1) normalização
export function norm(s = "") {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")     // remove acentos
    .replace(/[^a-z0-9\s]/g, " ")        // tira pontuação
    .replace(/\s+/g, " ")               // espaços múltiplos
    .trim();
}

// 2) aliases (curto e direto; você pode ir aumentando com o uso real)
const ALIASES = new Map([
  // especialidades
  ["psiquiatra", "psiquiatria"],
  ["psicologo", "psicologia"],
  ["terapia", "psicologia"],
  ["nutri", "nutricao"],
  ["nutricionista", "nutricao"],
  ["fono", "fonoaudiologia"],
  ["otorrino", "otorrinolaringologia"],
  ["neuro", "neurologia"],
  ["cardio", "cardiologia"],

  // variações comuns
  ["psiquiatrico", "psiquiatria"],
  ["psiquiatric", "psiquiatria"],
]);

export function applyAliases(queryRaw) {
  const q = norm(queryRaw);
  return ALIASES.get(q) ?? q;
}

// 3) distância (Levenshtein) p/ fuzzy
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

function similarity(a, b) {
  a = norm(a); b = norm(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const d = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - d / maxLen;
}

/**
 * resolveBestMatch
 * @param {string} query - texto do paciente (ex "psiquiatra")
 * @param {Array<{id:any,name:string}>} items - lista real do CRM
 * @param {object} opts
 * @returns {{status:'exact'|'fuzzy'|'none', best:null|any, top:Array<{item:any,score:number}>, queryNorm:string}}
 */
export function resolveBestMatch(query, items, opts = {}) {
  const threshold = opts.threshold ?? 0.78; // bom p/ pt-br
  const q0 = applyAliases(query);           // "psiquiatra" -> "psiquiatria"
  const q = norm(q0);

  const scored = (items || [])
    .filter(it => it?.name)
    .map(it => ({ item: it, score: similarity(q, it.name) }))
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return { status: "none", best: null, top: [], queryNorm: q };

  const best = scored[0];
  if (best.score >= 0.95) return { status: "exact", best: best.item, top: scored.slice(0, 3), queryNorm: q };
  if (best.score >= threshold) return { status: "fuzzy", best: best.item, top: scored.slice(0, 3), queryNorm: q };

  return { status: "none", best: null, top: scored.slice(0, 3), queryNorm: q };
}
