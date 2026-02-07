// src/config/defaults.js
/**
 * Defaults configuráveis via ENV.
 * Reduz perguntas do agente ao paciente:
 * se a clínica tem 1 empresa, 1 procedimento padrão, etc.
 */

export const DEFAULTS = {
  companyId:   env("DEFAULT_COMPANY_ID", null),
  procedureId: env("DEFAULT_PROCEDURE_ID", null),
  insuranceId: env("DEFAULT_INSURANCE_ID", null),  // ex: PARTICULAR
  // Janela de busca de horários (dias a partir de hoje)
  scheduleSearchDays: envInt("DEFAULT_SCHEDULE_SEARCH_DAYS", 14),
  // Máximo de slots livres para retornar ao agente
  maxFreeSlots: envInt("DEFAULT_MAX_FREE_SLOTS", 5),
  // País padrão para endereço
  countryId: envInt("DEFAULT_COUNTRY_ID", 1), // Brasil
};

function env(key, fallback) {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

function envInt(key, fallback) {
  const v = Number(process.env[key]);
  return Number.isFinite(v) ? v : fallback;
}
