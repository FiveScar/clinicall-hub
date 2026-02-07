// src/utils/semanticResolve.js

// ── normalização ────────────────────────────────────────────────────
export function norm(s = "") {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── aliases: input paciente → termo canônico do CRM ─────────────────
const ALIASES = new Map([
  ["psiquiatra", "psiquiatria"],["psicologo", "psicologia"],["psicologa", "psicologia"],
  ["terapia", "psicologia"],["terapeuta", "psicologia"],
  ["nutri", "nutricao"],["nutricionista", "nutricao"],
  ["fono", "fonoaudiologia"],["fonoaudiologo", "fonoaudiologia"],
  ["otorrino", "otorrinolaringologia"],
  ["neuro", "neurologia"],["neurologista", "neurologia"],
  ["cardio", "cardiologia"],["cardiologista", "cardiologia"],
  ["dermato", "dermatologia"],["dermatologista", "dermatologia"],
  ["oftalmo", "oftalmologia"],["oftalmologista", "oftalmologia"],
  ["orto", "ortopedia"],["ortopedista", "ortopedia"],
  ["uro", "urologia"],["urologista", "urologia"],
  ["gineco", "ginecologia"],["ginecologista", "ginecologia e obstetricia"],
  ["obstetra", "ginecologia e obstetricia"],
  ["pediatra", "pediatria"],
  ["endocrino", "endocrinologia"],["endocrinologista", "endocrinologia e metabologia"],
  ["gastro", "gastroenterologia"],["geriatra", "geriatria"],
  ["onco", "cancerologia"],["oncologista", "cancerologia"],["oncologia", "cancerologia"],
  ["infectologista", "infectologia"],["angiologista", "angiologia"],
  ["clinico", "clinico geral"],["clinico geral", "clinico geral"],
  ["clinica geral", "clinico geral"],["medico geral", "clinico geral"],
  ["ultrassom", "ultrassonografista"],["ecografia", "ultrassonografista"],
  ["consulta", "consulta"],["retorno", "retorno"],["exame", "exame"],
  ["holter", "holter"],["mapa", "mapa"],["eco", "ecocardiograma"],
  ["particular", "particular"],["sus", "sus"],["unimed", "unimed"],
  ["amil", "amil"],["bradesco", "bradesco"],
  ["homem", "masculino"],["mulher", "feminino"],["masc", "masculino"],["fem", "feminino"],
  ["solteiro", "solteiro"],["solteira", "solteiro"],
  ["casado", "casado"],["casada", "casado"],
  ["divorciado", "divorciado"],["divorciada", "divorciado"],
  ["viuvo", "viuvo"],["viuva", "viuvo"],
  ["psiquiatrico", "psiquiatria"],
]);

export function applyAliases(queryRaw) {
  const q = norm(queryRaw);
  return ALIASES.get(q) ?? q;
}

// ── Levenshtein ─────────────────────────────────────────────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  return dp[m][n];
}

function similarity(a, b) {
  a = norm(a); b = norm(b);
  if (!a || !b) return 0; if (a === b) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

function containsBonus(query, itemName) {
  const q = norm(query), n = norm(itemName);
  if (n.startsWith(q)) return 0.20;
  if (n.includes(q)) return 0.15;
  if (q.includes(n) && n.length >= 4) return 0.10;
  return 0;
}

/**
 * resolveBestMatch
 * @param {string} query
 * @param {Array<{id:any,name:string}>} items
 * @returns {{status:'exact'|'fuzzy'|'contains'|'none', best:null|any, top:Array, queryNorm:string}}
 */
export function resolveBestMatch(query, items, opts = {}) {
  const threshold = opts.threshold ?? 0.72;
  const q0 = applyAliases(query);
  const q = norm(q0);

  const scored = (items || [])
    .filter((it) => it?.name)
    .map((it) => {
      const sim = similarity(q, it.name);
      const bonus = containsBonus(q, it.name);
      return { item: it, score: Math.min(1, sim + bonus) };
    })
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return { status: "none", best: null, top: [], queryNorm: q };

  const best = scored[0];
  if (best.score >= 0.95) return { status: "exact", best: best.item, top: scored.slice(0, 3), queryNorm: q };
  if (best.score >= threshold) return { status: "fuzzy", best: best.item, top: scored.slice(0, 3), queryNorm: q };

  const containsMatch = scored.find((s) => norm(s.item.name).includes(q) || q.includes(norm(s.item.name)));
  if (containsMatch) return { status: "contains", best: containsMatch.item, top: scored.slice(0, 3), queryNorm: q };

  return { status: "none", best: null, top: scored.slice(0, 5), queryNorm: q };
}
