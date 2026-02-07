// src/orchestrator/rpcEngine.js
import clinicall from "../clinicall/client.js";
import * as contract from "./contract.js";
import { DEFAULTS } from "../config/defaults.js";
import { CLINIC, getClinicSection } from "../config/clinic.js";
import { resolveBestMatch, norm } from "../utils/semanticResolve.js";
import { getByCpf as indexGetByCpf, upsertPatient as indexUpsertPatient } from "../index/patientIndex.js";

/* ─── helpers ─────────────────────────────────────────────────────── */
function onlyDigits(v) { return String(v ?? "").replace(/\D+/g, ""); }
function toId(v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; }
function isDateYYYYMMDD(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? "").trim()); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function addDays(dateStr, days) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function stripTime(s) { return String(s ?? "").includes("T") ? s.split("T")[0] : String(s ?? ""); }

async function GET(p)    { return clinicall.request(p, { method: "GET" }); }
async function POST(p,b) { return clinicall.request(p, { method: "POST", body: b }); }
async function PUT(p,b)  { return clinicall.request(p, { method: "PUT", body: b }); }
async function DEL(p)    { return clinicall.request(p, { method: "DELETE" }); }

/* ─── payloads ────────────────────────────────────────────────────── */
function buildSearchBody(input = {}) {
  return {
    argument: String(input?.argument ?? "").trim(),
    page:     Number.isFinite(Number(input?.page)) ? Number(input.page) : 0,
    sizePage: Number.isFinite(Number(input?.sizePage)) ? Number(input.sizePage) : 25,
    fieldSort:     String(input?.fieldSort ?? "name"),
    sortDirection: String(input?.sortDirection ?? "asc"),
  };
}

function buildPatientPayload(input = {}) {
  const p = {};
  if (input.id) p.id = input.id;
  if (input.name) p.name = String(input.name).trim();
  if (input.cpf) p.cpf = onlyDigits(input.cpf);
  const bday = input.birthday ?? input.birthDate ?? input.birthdate;
  if (bday) p.birthday = String(bday).trim();
  const phone = input.phoneStandart ?? input.phone;
  if (phone) p.phoneStandart = onlyDigits(phone);
  if (input.email) p.email = String(input.email).trim().toLowerCase();
  if (input.mother) p.mother = input.mother;
  if (input.identity) p.identity = input.identity;
  if (input.active !== undefined) p.active = Boolean(input.active);
  if (input.medicalRecord) p.medicalRecord = input.medicalRecord;

  // IDs diretos ou nested
  const gId = toId(input.genderId ?? input.gender?.id);
  if (gId) p.genderId = gId;
  // COMPAT: Clinicall aceita gender obj no PUT
  if (input.gender?.id && !gId) p.gender = { id: Number(input.gender.id) };

  const csId = toId(input.civilStatusId ?? input.civilStatus?.id);
  if (csId) p.civilStatusId = csId;
  if (input.civilStatus?.id && !csId) p.civilStatus = { id: Number(input.civilStatus.id) };

  const insId = toId(input.insuranceId ?? input.insurance?.id);
  if (insId) p.insuranceId = insId;
  if (input.insurance?.id && !insId) p.insurance = { id: Number(input.insurance.id) };

  if (input.address) {
    const a = input.address;
    p.address = {};
    if (a.id) p.address.id = a.id;
    if (a.address) p.address.address = a.address;
    if (a.district) p.address.district = a.district;
    if (a.zipcode) p.address.zipcode = a.zipcode;
    if (a.description) p.address.description = a.description;
    if (a.number) p.address.number = a.number;
    if (a.addon) p.address.addon = a.addon;
    const atId = toId(a.addressTypeId ?? a.addressType?.id);
    if (atId) p.address.addressTypeId = atId;
    else if (a.addressType?.id) p.address.addressType = { id: Number(a.addressType.id) };
    const cId = toId(a.cityId ?? a.city?.id);
    if (cId) p.address.cityId = cId;
    else if (a.city?.id) p.address.city = { id: Number(a.city.id) };
    p.address.countryId = toId(a.countryId ?? a.country?.id) ?? DEFAULTS.countryId;
  }

  // remove undefined
  Object.keys(p).forEach(k => p[k] === undefined && delete p[k]);
  return p;
}

/* ─── in-memory cache for domain lists (TTL 10min) ────────────────── */
const _cache = {};
async function cached(key, fetcher, ttlMs = 600_000) {
  const entry = _cache[key];
  if (entry && Date.now() - entry.at < ttlMs) return entry.data;
  const data = await fetcher();
  _cache[key] = { data, at: Date.now() };
  return data;
}

function extractList(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.content)) return raw.content;
  if (Array.isArray(raw?.data?.content)) return raw.data.content;
  if (Array.isArray(raw?.data)) return raw.data;
  return [];
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  RPC ENGINE                                                         */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export async function runRpc({ op, data } = {}) {
  op = String(op || "").trim();

  try {

    /* ╔══════════════════════════════╗ */
    /* ║       COMPANIES              ║ */
    /* ╚══════════════════════════════╝ */
    if (op === "companies.list") {
      const r = await GET("/partners/company");
      return contract.ok({ data: r, nextAction: "companies_list" });
    }

    /* ╔══════════════════════════════╗ */
    /* ║       STATUS                 ║ */
    /* ╚══════════════════════════════╝ */
    if (op === "status.simpleList") {
      const type = String(data?.type || "").trim();
      if (!type) return contract.error("status.simpleList: type é obrigatório (patientStatus|scheduleStatus)");
      const r = await GET(`/partners/status/${type}/simpleList`);
      return contract.ok({ data: r, nextAction: "status_list" });
    }

    /* ╔══════════════════════════════╗ */
    /* ║       PATIENT CRUD           ║ */
    /* ╚══════════════════════════════╝ */

    // ── search ──
    if (op === "patient.search") {
      const raw = String(data?.argument ?? "").trim();
      if (!raw) return contract.error("patient.search: argument é obrigatório (cpf ou nome)");

      // 🔍 DEBUG: Log de busca de paciente
      console.log("\n🔍 === PATIENT SEARCH DEBUG ===");
      console.log("📝 Query original:", raw);

      const cpfDigits = onlyDigits(raw);
      const looksCpf = cpfDigits.length === 11;

      console.log("🆔 CPF detectado?", looksCpf ? "SIM" : "NÃO", looksCpf ? `(${cpfDigits})` : "");

      // helper: verifica se todos os tokens do query aparecem no nome do paciente (sem acento/case)
      const containsAllTokens = (patientName, query) => {
        const nameN = norm(patientName);
        const tokens = norm(query).split(" ").filter(Boolean);
        return tokens.every(t => nameN.includes(t));
      };

      // 1) Se veio CPF, tenta memória/índice local (blindado)
      if (looksCpf) {
        const hit = await indexGetByCpf(cpfDigits);
        if (hit?.id) {
          console.log("✅ Paciente encontrado no índice local:", hit.name);
          console.log("=================================\n");
          return contract.ok({
            data: { id: hit.id, label: `${String(hit.name||"").trim()} — CPF ${cpfDigits}`.trim() },
            options: [],
            nextAction: "patient_found_single",
          });
        }

        console.log("⚠️  CPF não encontrado no índice local");

        // Se veio CPF + nome (opcional), usa nome como seed para puxar candidatos e filtrar pelo CPF
        const nameHint = String(data?.name ?? data?.fullName ?? "").trim();
        if (!nameHint) {
          console.log("❌ Nome não fornecido junto com CPF");
          console.log("=================================\n");
          return contract.ok({
            data: {},
            options: [],
            nextAction: "need_name_for_cpf_search",
            message: "Perfeito. Para localizar seu cadastro com segurança, me diga seu nome completo junto do CPF.",
          });
        }

        console.log("🔎 Buscando na API com nome:", nameHint);

        const seed = norm(nameHint).split(" ").filter(Boolean)[0] || "";
        if (!seed) {
          return contract.ok({
            data: {},
            options: [],
            nextAction: "need_name_for_cpf_search",
            message: "Perfeito. Para localizar seu cadastro com segurança, me diga seu nome completo junto do CPF.",
          });
        }

        const body = buildSearchBody({ ...data, argument: seed });
        const r = await POST("/partners/patient/search", body);
        const list = extractList(r);

        const filtered = list.filter(p => onlyDigits(p?.cpf) === cpfDigits);
        const finalList = filtered.length ? filtered : list;

        const options = finalList.slice(0, 25).map(p => ({
          id: p.id,
          label: `${String(p.name||"").trim()} — CPF ${String(p.cpf||"").trim()}`.trim(),
        }));

        if (!options.length) return contract.ok({
          data: [],
          options: [],
          nextAction: "patient_not_found",
          message: "Não encontrei cadastro com esses dados. Posso fazer seu cadastro agora.",
        });

        if (options.length === 1) {
          // upsert no índice (melhora as próximas buscas)
          await indexUpsertPatient(finalList[0]).catch(() => {});
          return contract.ok({
            data: { id: options[0].id, label: options[0].label },
            options: [],
            nextAction: "patient_found_single",
          });
        }

        return contract.ok({
          data: {},
          options,
          nextAction: "choose_patient",
          message: "Encontrei mais de um cadastro. Qual é o seu?",
        });
      }

      // 2) Nome completo / texto: o endpoint do Clinicall é prefix-only → usa primeiro token como seed e filtra local
      const qNorm = norm(raw);
      const seed = qNorm.split(" ").filter(Boolean)[0] || qNorm;

      const body = buildSearchBody({ ...data, argument: seed });
      const r = await POST("/partners/patient/search", body);
      const list = extractList(r);

      // Se o usuário mandou nome completo (tem espaço), tenta filtrar localmente
      const isFullName = qNorm.includes(" ");
      const filtered = isFullName ? list.filter(p => containsAllTokens(p?.name ?? "", raw)) : list;
      const finalList = filtered.length ? filtered : list;

      const options = finalList.slice(0, 25).map(p => ({
        id: p.id,
        label: `${String(p.name||"").trim()} — CPF ${String(p.cpf||"").trim()}`.trim(),
      }));

      if (!options.length) return contract.ok({
        data: [],
        options: [],
        nextAction: "patient_not_found",
        message: "Não encontrei cadastro com esses dados. Posso fazer seu cadastro agora.",
      });

      if (options.length === 1) {
        await indexUpsertPatient(finalList[0]).catch(() => {});
        return contract.ok({
          data: { id: options[0].id, label: options[0].label },
          options: [],
          nextAction: "patient_found_single",
        });
      }

      return contract.ok({
        data: {},
        options,
        nextAction: "choose_patient",
        message: "Encontrei mais de um cadastro. Qual é o seu?",
      });
    }

    // ── get ──
    if (op === "patient.get") {
      const id = toId(data?.id ?? data?.patientId);
      if (!id) return contract.error("patient.get: id inválido");
      const r = await GET(`/partners/patient/${id}`);
      return contract.ok({ data: r, nextAction: "patient_loaded" });
    }

    // ── create ──
    if (op === "patient.create") {
      const payload = buildPatientPayload(data || {});
      if (!payload.name) return contract.error("patient.create: name é obrigatório");
      if (!payload.cpf || onlyDigits(payload.cpf).length !== 11) return contract.error("patient.create: CPF inválido (11 dígitos)");
      if (!payload.birthday) return contract.error("patient.create: birthday é obrigatório (YYYY-MM-DD)");
      
      const r = await POST("/partners/patient", payload);
      const created = r?.data ?? r;
      
      // 🔍 AUTO-INDEX: Indexa o paciente criado automaticamente
      if (created?.id && payload.cpf) {
        console.log("📝 Auto-indexando paciente criado:", created.id, payload.name);
        await indexUpsertPatient({
          id: created.id,
          cpf: onlyDigits(payload.cpf),
          name: payload.name
        }).catch(err => {
          console.error("⚠️  Erro ao indexar paciente:", err.message);
        });
      }
      
      return contract.ok({ data: created, nextAction: "patient_created" });
    }

    // ── update ──
    if (op === "patient.update") {
      const id = toId(data?.id ?? data?.patientId);
      if (!id) return contract.error("patient.update: id é obrigatório");
      // Busca dados atuais para merge
      const current = await GET(`/partners/patient/${id}`);
      const currentData = current?.data ?? current;
      // Merge: dados novos sobrescrevem os antigos
      const merged = { ...currentData, ...buildPatientPayload({ ...currentData, ...data, id }) };
      const r = await PUT("/partners/patient", merged);
      return contract.ok({ data: r?.data ?? r, nextAction: "patient_updated" });
    }

    // ── delete ──
    if (op === "patient.delete") {
      const id = toId(data?.id ?? data?.patientId);
      if (!id) return contract.error("patient.delete: id inválido");
      const r = await DEL(`/partners/patient/${id}`);
      return contract.ok({ data: r?.data ?? r, nextAction: "patient_deleted" });
    }

    // ── birthday ──
    if (op === "patient.birthday") {
      const month = data?.month; const day = data?.day;
      if (!month || !day) return contract.error("patient.birthday: month e day são obrigatórios");
      const r = await GET(`/partners/birthday-person/today/${month}/${day}`);
      return contract.ok({ data: r?.data ?? r, nextAction: "patient_birthday_list" });
    }

    /* ╔══════════════════════════════╗ */
    /* ║   DOMAIN TABLES (domínio)    ║ */
    /* ╚══════════════════════════════╝ */

    // ── gender ──
    if (op === "domain.gender") {
      const items = await cached("genders", () => POST("/partners/gender/search", buildSearchBody({ argument: "" })));
      const list = extractList(items);
      // Se veio query, resolve semântico
      if (data?.query) {
        const match = resolveBestMatch(data.query, list);
        if (match.best) return contract.ok({ data: match.best, resolved: match.status, nextAction: "gender_resolved" });
        return contract.ok({ data: list, options: list.map(i => ({ id: i.id, label: i.name })), nextAction: "gender_choose" });
      }
      return contract.ok({ data: list, nextAction: "gender_list" });
    }

    // ── civilStatus ──
    if (op === "domain.civilStatus") {
      const items = await cached("civilStatus", () => POST("/partners/civilStatus/search", buildSearchBody({ argument: "" })));
      const list = extractList(items);
      if (data?.query) {
        const match = resolveBestMatch(data.query, list);
        if (match.best) return contract.ok({ data: match.best, resolved: match.status, nextAction: "civilStatus_resolved" });
      }
      return contract.ok({ data: list, nextAction: "civilStatus_list" });
    }

    // ── city ──
    if (op === "domain.city") {
      const body = buildSearchBody(data || {});
      if (!body.argument) return contract.error("domain.city: argument é obrigatório");
      const r = await POST("/partners/city/search", body);
      const list = extractList(r);
      if (data?.query) {
        const match = resolveBestMatch(data.query || data.argument, list);
        if (match.best) return contract.ok({ data: match.best, resolved: match.status, nextAction: "city_resolved" });
      }
      return contract.ok({ data: list, nextAction: "city_list" });
    }

    // ── state ──
    if (op === "domain.state") {
      const body = buildSearchBody(data || {});
      const r = await POST("/partners/state/search", body);
      return contract.ok({ data: extractList(r), nextAction: "state_list" });
    }

    // ── country ──
    if (op === "domain.country") {
      const body = buildSearchBody(data || {});
      const r = await POST("/partners/country/search", body);
      return contract.ok({ data: extractList(r), nextAction: "country_list" });
    }

    // ── addressType ──
    if (op === "domain.addressType") {
      const body = buildSearchBody(data || {});
      const r = await POST("/partners/addressType/search", body);
      return contract.ok({ data: extractList(r), nextAction: "addressType_list" });
    }

    /* ╔══════════════════════════════╗ */
    /* ║    SPECIALITY / DOCTOR       ║ */
    /* ║    PROCEDURE / INSURANCE     ║ */
    /* ║   com resolução semântica    ║ */
    /* ╚══════════════════════════════╝ */

    // ── speciality.search ── (com resolução semântica se query vier)
    if (op === "speciality.search") {
      const body = buildSearchBody(data || {});
      // Se não tem argument, lista tudo (pra agente exibir opções)
      const r = await POST("/partners/speciality/search", { ...body, argument: body.argument || "" });
      const list = extractList(r);
      // Se veio query semântica, tenta resolver
      if (data?.query || body.argument) {
        const q = data?.query || body.argument;
        const match = resolveBestMatch(q, list);
        if (match.best) return contract.ok({
          data: match.best, resolved: match.status,
          options: match.top.map(t => ({ id: t.item.id, label: t.item.name, score: t.score })),
          nextAction: "speciality_resolved",
          message: `Encontrei: ${match.best.name}`,
        });
        // Nenhum match → retorna opções disponíveis
        return contract.ok({
          data: {}, options: list.slice(0, 10).map(i => ({ id: i.id, label: i.name })),
          nextAction: "speciality_choose",
          message: "Não encontrei essa especialidade. Veja as disponíveis:",
        });
      }
      return contract.ok({ data: r, nextAction: "specialities_list" });
    }

    // ── professional.search / doctor.search ──
    if (op === "professional.search" || op === "doctor.search") {
      const body = buildSearchBody(data || {});
      const endpoint = op === "doctor.search" ? "/partners/performer/search" : "/partners/professional/search";
      const r = await POST(endpoint, { ...body, argument: body.argument || "" });
      const list = extractList(r);

      // 🔍 DEBUG: Logs detalhados para diagnóstico
      console.log("\n🔍 === PROFESSIONAL SEARCH DEBUG ===");
      console.log("📝 Query original:", data?.query || body.argument);
      console.log("📊 Total de profissionais retornados pela API:", list.length);
      console.log("👥 Primeiros 10 profissionais:", list.slice(0, 10).map(p => ({
        id: p.id || p.performerId || p.professionalId,
        name: p.name,
        speciality: p.speciality?.name || p.horary?.speciality?.name || "—"
      })));

      if (data?.query || body.argument) {
        const q = data?.query || body.argument;
        
        // Matching com threshold mais baixo para nomes próprios (0.60 ao invés de 0.72)
        const match = resolveBestMatch(q, list, { threshold: 0.60 });
        
        // 🔍 DEBUG: Resultado do matching
        console.log("\n🎯 Resultado do matching:");
        console.log("   Status:", match.status);
        console.log("   Query normalizada:", match.queryNorm);
        console.log("   Top 5 matches:", match.top.slice(0, 5).map(t => ({
          name: t.item.name,
          score: t.score.toFixed(3)
        })));
        
        if (match.best) {
          console.log("✅ Match encontrado:", match.best.name, "| Score:", match.top[0]?.score.toFixed(3));
          console.log("=================================\n");
          
          return contract.ok({
            data: match.best, 
            resolved: match.status,
            nextAction: "professional_resolved",
            message: `Encontrei: ${match.best.name}`,
          });
        }
        
        console.log("❌ Nenhum match adequado encontrado");
        console.log("=================================\n");
        
        // Retorna sugestões mais inteligentes
        const suggestions = match.top.slice(0, 5);
        return contract.ok({
          data: {}, 
          options: list.slice(0, 10).map(i => ({ 
            id: i.performerId || i.professionalId || i.id, 
            label: `${i.name} — ${i.speciality?.name || ""}`.trim() 
          })),
          nextAction: "professional_choose",
          message: suggestions.length > 0 
            ? `Não encontrei "${q}" exatamente. Talvez você quis dizer: ${suggestions.slice(0, 3).map(s => s.item.name).join(", ")}?`
            : "Não encontrei esse profissional. Veja os disponíveis:",
        });
      }
      
      return contract.ok({ data: r, nextAction: "professionals_list" });
    }

    // ── procedure.search ──
    if (op === "procedure.search") {
      const body = buildSearchBody(data || {});
      const r = await POST("/partners/procedure/search", { ...body, argument: body.argument || "" });
      const list = extractList(r);
      if (data?.query || body.argument) {
        const q = data?.query || body.argument;
        const match = resolveBestMatch(q, list);
        if (match.best) return contract.ok({ data: match.best, resolved: match.status, nextAction: "procedure_resolved" });
        return contract.ok({ data: {}, options: list.slice(0, 10).map(i => ({ id: i.id, label: i.name })),
          nextAction: "procedure_choose" });
      }
      return contract.ok({ data: r, nextAction: "procedures_list" });
    }

    // ── insurance.search ──
    if (op === "insurance.search") {
      const body = buildSearchBody(data || {});
      const r = await POST("/partners/insurance/search", { ...body, argument: body.argument || "" });
      const list = extractList(r);
      if (data?.query || body.argument) {
        const q = data?.query || body.argument;
        const match = resolveBestMatch(q, list);
        if (match.best) return contract.ok({ data: match.best, resolved: match.status, nextAction: "insurance_resolved" });
        return contract.ok({ data: {}, options: list.slice(0, 10).map(i => ({ id: i.id, label: i.name })),
          nextAction: "insurance_choose" });
      }
      return contract.ok({ data: r, nextAction: "insurances_list" });
    }

    // ── accreditation.search (procedimentos por convênio + executante) ──
    if (op === "accreditation.search") {
      const body = {
        insuranceId: toId(data?.insuranceId) ?? null,
        performerId: toId(data?.performerId) ?? null,
        companyId:   toId(data?.companyId) ?? DEFAULTS.companyId,
        pageSearchTO: buildSearchBody(data || {}),
      };
      const r = await POST("/partners/insurance/accreditation/search", body);
      return contract.ok({ data: r, nextAction: "accreditation_list" });
    }

    // ── plan.search (planos de um convênio) ──
    if (op === "plan.search") {
      const insId = toId(data?.insuranceId);
      if (!insId) return contract.error("plan.search: insuranceId é obrigatório");
      const r = await POST(`/partners/insurance/${insId}/planList`, buildSearchBody(data || {}));
      return contract.ok({ data: r, nextAction: "plan_list" });
    }

    /* ╔══════════════════════════════╗ */
    /* ║       PARAMETERS             ║ */
    /* ╚══════════════════════════════╝ */
    if (op === "parameters.check") {
      const r = await GET("/partners/parameters");
      return contract.ok({ data: r, nextAction: "parameters_loaded" });
    }

    if (op === "parameters.orderArrival") {
      const companyId  = toId(data?.companyId) ?? DEFAULTS.companyId;
      const performerId = toId(data?.performerId);
      if (!companyId || !performerId) return contract.error("parameters.orderArrival: companyId e performerId obrigatórios");
      const r = await GET(`/partners/company-performer/${companyId}/${performerId}/order-arrive`);
      return contract.ok({ data: r?.data ?? r, nextAction: "order_arrival_checked" });
    }

    /* ╔══════════════════════════════╗ */
    /* ║       SCHEDULE               ║ */
    /* ╚══════════════════════════════╝ */

    // ── search ──
    if (op === "schedule.search" || op === "schedule.search.v2") {
      const started = stripTime(data?.started);
      const ended   = stripTime(data?.ended);
      if (!isDateYYYYMMDD(started) || !isDateYYYYMMDD(ended))
        return contract.error("schedule.search: started/ended devem ser YYYY-MM-DD");
      const body = {
        specialityId: toId(data?.specialityId)  ?? null,
        performerId:  toId(data?.performerId)   ?? null,
        insuranceId:  toId(data?.insuranceId)   ?? null,
        procedureId:  toId(data?.procedureId)   ?? null,
        companyId:    toId(data?.companyId)      ?? DEFAULTS.companyId,
        confirm:      Boolean(data?.confirm ?? false),
        status:        data?.status        ?? null,
        patientStatus: data?.patientStatus ?? null,
        started, ended,
      };
      const r = await POST("/partners/schedule/v2/search", body);
      return contract.ok({ data: r, nextAction: "schedules_list" });
    }

    // ── findFreeSlots ── (ORQUESTRAÇÃO: busca agenda e filtra slots livres)
    if (op === "schedule.findFreeSlots") {
      const specialityId = toId(data?.specialityId);
      const performerId  = toId(data?.performerId);
      const insuranceId  = toId(data?.insuranceId) ?? DEFAULTS.insuranceId;
      const procedureId  = toId(data?.procedureId) ?? DEFAULTS.procedureId;
      const companyId    = toId(data?.companyId)    ?? DEFAULTS.companyId;
      const started      = stripTime(data?.started) || todayISO();
      const ended        = stripTime(data?.ended)   || addDays(started, DEFAULTS.scheduleSearchDays);
      const maxSlots     = data?.maxSlots ?? DEFAULTS.maxFreeSlots;

      if (!specialityId && !performerId)
        return contract.error("schedule.findFreeSlots: specialityId ou performerId é obrigatório");

      const searchBody = {
        specialityId, performerId, insuranceId, procedureId, companyId,
        confirm: false, status: null, patientStatus: null,
        started, ended,
      };

      const r = await POST("/partners/schedule/v2/search", searchBody);
      const all = extractList(r?.data ?? r);

      // Filtra slots livres: scheduleStatus="A" e sem paciente
      const free = all.filter(s =>
        s.scheduleStatus === "A" && (!s.patient || !s.patient?.id)
      );

      const slots = free.slice(0, maxSlots).map(s => ({
        scheduleId: s.id,
        date: s.date,
        hour: s.hour,
        performer: s.performer?.professional?.person?.name
                   ?? s.performer?.name
                   ?? data?.performerName ?? "—",
        performerId: s.performer?.id ?? performerId,
        speciality: s.horary?.speciality?.name
                    ?? s.speciality?.name
                    ?? data?.specialityName ?? "—",
        specialityId: s.horary?.speciality?.id ?? specialityId,
        company: s.company?.name ?? s.company?.alias ?? data?.companyName ?? "—",
        companyId: s.company?.id ?? companyId,
      }));

      if (!slots.length) {
        return contract.ok({
          data: [], options: [],
          nextAction: "no_free_slots",
          message: `Não há horários disponíveis de ${started} a ${ended}. Posso buscar em outro período.`,
        });
      }

      return contract.ok({
        data: slots,
        options: slots.map(s => ({
          id: s.scheduleId,
          label: `${s.date} às ${s.hour} — Dr(a) ${s.performer} (${s.speciality})`,
        })),
        nextAction: "free_slots_found",
        message: `Encontrei ${slots.length} horário(s) disponível(is). Qual prefere?`,
      });
    }

    // ── book ──
    if (op === "schedule.book") {
      const scheduleId  = toId(data?.scheduleId);
      const insuranceId = toId(data?.insuranceId) ?? DEFAULTS.insuranceId;
      const procedureId = toId(data?.procedureId) ?? DEFAULTS.procedureId;
      const patientId   = toId(data?.patientId);
      if (!scheduleId) return contract.error("schedule.book: scheduleId é obrigatório");
      if (!insuranceId) return contract.error("schedule.book: insuranceId é obrigatório");
      if (!procedureId) return contract.error("schedule.book: procedureId é obrigatório");

      let patient = null;
      if (!patientId) {
        const p = data?.patient || {};
        if (!p?.name || !p?.birthday || !p?.phoneStandart)
          return contract.error("schedule.book: patientId ou patient{name,birthday,phoneStandart} obrigatório");
        patient = {
          name: String(p.name).trim(), birthday: String(p.birthday).trim(),
          cpf: p.cpf ? onlyDigits(p.cpf) : "", cns: p.cns ?? "",
          phoneStandart: onlyDigits(p.phoneStandart),
        };
      }
      const body = { scheduleId, insuranceId, procedureId, patientId: patientId ?? null, patient: patientId ? null : patient };
      const r = await PUT("/partners/schedule", body);
      return contract.ok({ data: r, nextAction: "schedule_booked" });
    }

    // ── bookAndConfirm ──
    if (op === "schedule.bookAndConfirm") {
      const scheduleId  = toId(data?.scheduleId);
      const insuranceId = toId(data?.insuranceId) ?? DEFAULTS.insuranceId;
      const procedureId = toId(data?.procedureId) ?? DEFAULTS.procedureId;
      const patientId   = toId(data?.patientId);
      if (!scheduleId) return contract.error("schedule.bookAndConfirm: scheduleId obrigatório");
      if (!insuranceId) return contract.error("schedule.bookAndConfirm: insuranceId obrigatório");
      if (!procedureId) return contract.error("schedule.bookAndConfirm: procedureId obrigatório");
      if (!patientId)   return contract.error("schedule.bookAndConfirm: patientId obrigatório");

      const booked = await PUT("/partners/schedule", { scheduleId, insuranceId, procedureId, patientId, patient: null });
      const confirmed = await POST("/partners/scheduleConfirm", { scheduleId });
      return contract.ok({ data: { booked, confirmed }, nextAction: "schedule_booked_confirmed" });
    }

    // ── confirm ──
    if (op === "schedule.confirm") {
      const scheduleId = toId(data?.scheduleId ?? data?.id);
      if (!scheduleId) return contract.error("schedule.confirm: scheduleId obrigatório");
      const r = await POST("/partners/scheduleConfirm", { scheduleId });
      return contract.ok({ data: r, nextAction: "schedule_confirmed" });
    }

    if (op === "schedule.confirm.get") {
      const scheduleId = toId(data?.scheduleId ?? data?.id);
      if (!scheduleId) return contract.error("schedule.confirm.get: scheduleId obrigatório");
      const r = await GET(`/partners/scheduleConfirm/${scheduleId}`);
      return contract.ok({ data: r, nextAction: "schedule_confirm_loaded" });
    }

    // ── cancel ──
    if (op === "schedule.cancel") {
      const scheduleId = toId(data?.scheduleId ?? data?.id);
      if (!scheduleId) return contract.error("schedule.cancel: scheduleId obrigatório");
      try {
        const r = await POST("/partners/scheduleCancel", { scheduleId });
        return contract.ok({ data: r, nextAction: "schedule_cancelled" });
      } catch {
        // fallback via patientStatus
        const r = await POST(`/partners/${scheduleId}/patientStatus/B`, {});
        return contract.ok({ data: r, nextAction: "schedule_cancelled" });
      }
    }

    // ── reschedule (cancela antigo + agenda novo) ──
    if (op === "schedule.reschedule") {
      const oldScheduleId = toId(data?.oldScheduleId ?? data?.currentScheduleId);
      const newScheduleId = toId(data?.newScheduleId ?? data?.scheduleId);
      const insuranceId   = toId(data?.insuranceId) ?? DEFAULTS.insuranceId;
      const procedureId   = toId(data?.procedureId) ?? DEFAULTS.procedureId;
      const patientId     = toId(data?.patientId);

      if (!oldScheduleId) return contract.error("schedule.reschedule: oldScheduleId obrigatório");
      if (!newScheduleId) return contract.error("schedule.reschedule: newScheduleId obrigatório");
      if (!patientId)     return contract.error("schedule.reschedule: patientId obrigatório");
      if (!insuranceId)   return contract.error("schedule.reschedule: insuranceId obrigatório");
      if (!procedureId)   return contract.error("schedule.reschedule: procedureId obrigatório");

      // 1) Cancela o agendamento antigo
      let cancelled;
      try {
        cancelled = await POST("/partners/scheduleCancel", { scheduleId: oldScheduleId });
      } catch {
        cancelled = await POST(`/partners/${oldScheduleId}/patientStatus/B`, {});
      }

      // 2) Agenda no novo horário
      const booked = await PUT("/partners/schedule", { scheduleId: newScheduleId, insuranceId, procedureId, patientId, patient: null });

      // 3) Confirma
      const confirmed = await POST("/partners/scheduleConfirm", { scheduleId: newScheduleId });

      return contract.ok({
        data: { cancelled, booked, confirmed },
        nextAction: "schedule_rescheduled",
        message: "Consulta remarcada com sucesso.",
      });
    }

    // ── status update (patientStatus) ──
    if (op === "schedule.status.update") {
      const scheduleId = toId(data?.scheduleId ?? data?.id);
      const statusCode = String(data?.statusCode ?? data?.status ?? "").trim().toUpperCase();
      if (!scheduleId) return contract.error("schedule.status.update: scheduleId obrigatório");
      if (!statusCode) return contract.error("schedule.status.update: statusCode obrigatório (C=confirmado, B=cancelado, E=encaixe, etc)");
      const r = await POST(`/partners/${scheduleId}/patientStatus/${statusCode}`, {});
      return contract.ok({ data: r, nextAction: "schedule_status_updated" });
    }

    // ── patient schedules (busca agendamentos de um paciente) ──
    if (op === "schedule.byPatient") {
      const patientId   = toId(data?.patientId);
      const started     = stripTime(data?.started) || todayISO();
      const ended       = stripTime(data?.ended)   || addDays(started, 90);
      if (!patientId) return contract.error("schedule.byPatient: patientId obrigatório");

      const searchBody = {
        specialityId: null, performerId: null, insuranceId: null, procedureId: null,
        companyId: DEFAULTS.companyId, confirm: false, status: null, patientStatus: null,
        started, ended,
      };
      const r = await POST("/partners/schedule/v2/search", searchBody);
      const all = extractList(r?.data ?? r);

      // Filtra pelo patientId
      const patientSchedules = all.filter(s => s.patient?.id === patientId || s.patient?.person?.id === patientId);

      const formatted = patientSchedules.map(s => ({
        scheduleId: s.id,
        date: s.date,
        hour: s.hour,
        performer: s.performer?.professional?.person?.name ?? "—",
        speciality: s.horary?.speciality?.name ?? "—",
        procedure: s.procedure?.name ?? "—",
        insurance: s.insurance?.name ?? "—",
        scheduleStatus: s.scheduleStatus,
        patientStatus: s.patientStatus,
      }));

      if (!formatted.length) return contract.ok({
        data: [], nextAction: "patient_no_schedules",
        message: "Não encontrei agendamentos para este paciente no período.",
      });

      return contract.ok({
        data: formatted,
        nextAction: "patient_schedules_found",
        message: `Encontrei ${formatted.length} agendamento(s).`,
      });
    }

    /* ╔══════════════════════════════╗ */
    /* ║       ORDERS (OS)            ║ */
    /* ╚══════════════════════════════╝ */
    if (op === "order.create") {
      const r = await POST("/partners/order", data);
      return contract.ok({ data: r?.data ?? r, nextAction: "order_created" });
    }

    if (op === "order.fromSchedule") {
      const scheduleId = toId(data?.scheduleId);
      if (!scheduleId) return contract.error("order.fromSchedule: scheduleId obrigatório");
      const r = await POST(`/partners/order/schedule?scheduleId=${scheduleId}`, {});
      return contract.ok({ data: r?.data ?? r, nextAction: "order_created_from_schedule" });
    }

    if (op === "order.get") {
      const orderId = toId(data?.orderId ?? data?.id);
      if (!orderId) return contract.error("order.get: orderId obrigatório");
      const r = await GET(`/partners/order/${orderId}`);
      return contract.ok({ data: r?.data ?? r, nextAction: "order_loaded" });
    }

    /* ╔══════════════════════════════╗ */
    /* ║   CÉREBRO DA CLÍNICA         ║ */
    /* ╚══════════════════════════════╝ */
    if (op === "clinic.info") {
      const section = data?.section || "all";
      return contract.ok({ data: getClinicSection(section), nextAction: "clinic_info_loaded" });
    }
    if (op === "clinic.address" || op === "clinic.endereco") {
      return contract.ok({ data: getClinicSection("address"), nextAction: "address_loaded" });
    }
    if (op === "clinic.hours" || op === "clinic.horario") {
      return contract.ok({ data: getClinicSection("hours"), nextAction: "hours_loaded" });
    }
    if (op === "clinic.contacts" || op === "clinic.contatos") {
      return contract.ok({ data: getClinicSection("contacts"), nextAction: "contacts_loaded" });
    }
    if (op === "clinic.services" || op === "clinic.servicos") {
      return contract.ok({ data: getClinicSection("services"), nextAction: "services_loaded" });
    }
    if (op === "clinic.insurance" || op === "clinic.convenios") {
      return contract.ok({ data: getClinicSection("insurance"), nextAction: "insurance_loaded" });
    }
    if (op === "clinic.payment" || op === "clinic.pagamento") {
      return contract.ok({ data: getClinicSection("payment"), nextAction: "payment_loaded" });
    }
    if (op === "clinic.instructions" || op === "clinic.instrucoes") {
      return contract.ok({ data: getClinicSection("instructions"), nextAction: "instructions_loaded" });
    }
    if (op === "clinic.messages" || op === "clinic.mensagens") {
      return contract.ok({ data: getClinicSection("messages"), nextAction: "messages_loaded" });
    }

    /* ╔══════════════════════════════╗ */
    /* ║      DEFAULTS / META         ║ */
    /* ╚══════════════════════════════╝ */
    if (op === "defaults.get") {
      return contract.ok({ data: DEFAULTS, nextAction: "defaults_loaded" });
    }

    if (op === "ops.list") {
      return contract.ok({
        data: {
          patient: ["patient.search", "patient.get", "patient.create", "patient.update", "patient.delete", "patient.birthday"],
          schedule: ["schedule.search", "schedule.findFreeSlots", "schedule.book", "schedule.bookAndConfirm",
                     "schedule.confirm", "schedule.confirm.get", "schedule.cancel", "schedule.reschedule",
                     "schedule.status.update", "schedule.byPatient"],
          lookup: ["speciality.search", "doctor.search", "professional.search", "procedure.search",
                   "insurance.search", "accreditation.search", "plan.search"],
          domain: ["domain.gender", "domain.civilStatus", "domain.city", "domain.state", "domain.country", "domain.addressType"],
          company: ["companies.list", "status.simpleList", "parameters.check", "parameters.orderArrival"],
          order: ["order.create", "order.fromSchedule", "order.get"],
          meta: ["defaults.get", "ops.list"],
          clinic: ["clinic.info", "clinic.address", "clinic.hours", "clinic.contacts",
                   "clinic.services", "clinic.insurance", "clinic.payment",
                   "clinic.instructions", "clinic.messages"],
        },
        nextAction: "ops_listed",
      });
    }

    return contract.error(`Operação "${op}" não suportada. Use ops.list para ver operações disponíveis.`);

  } catch (err) {
    const details = err?.response?.data || err?.data || err?.payload || err?.message || String(err);
    console.error("RPC ENGINE ERROR:", op, err?.message || err);
    if (err?.status) console.error("UPSTREAM STATUS:", err.status);
    if (err?.stack) console.error(err.stack);
    return { status: "error", message: "Instabilidade temporária no CRM. Tente novamente em instantes.", details, op };
  }
}