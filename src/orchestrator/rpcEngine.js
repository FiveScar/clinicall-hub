// src/orchestrator/rpcEngine.js
import clinicall from "../clinicall/client.js";
import * as contract from "./contract.js";

function topOptions(list, mapper, limit = 3) {
  return (Array.isArray(list) ? list : []).slice(0, limit).map(mapper);
}

function onlyDigits(v) {
  return String(v ?? "").replace(/\D+/g, "");
}

function normalizeBRPhoneDigits(raw) {
  let d = onlyDigits(raw);
  // remove DDI 55 se vier
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  return d;
}

function looksLikePhone(argDigits) {
  // BR: 10 (DDD+8) ou 11 (DDD+9) — aceitamos também variações com DDI removido antes
  return argDigits.length === 10 || argDigits.length === 11;
}

function patientPhonesDigits(p) {
  const phones = [
    p?.phoneStandard,
    p?.phone,
    p?.cellphone,
    p?.telephone,
    p?.mobile,
    p?.whatsapp,
  ].filter(Boolean);

  return phones.map(normalizeBRPhoneDigits).filter(Boolean);
}

async function patientSearchPage({ argument = "", page = 0, sizePage = 50 }) {
  return clinicall.request("/partners/patient/search", {
    method: "POST",
    body: {
      argument,
      page,
      sizePage,
      fieldSort: "name",
      sortDirection: "asc",
    },
  });
}

async function scanPatientByPhone(targetDigits, { maxPages = 15, sizePage = 50 } = {}) {
  // SCAN: argument vazio -> lista paginada; filtra localmente por telefone
  for (let page = 0; page < maxPages; page++) {
    const resp = await patientSearchPage({ argument: "", page, sizePage });
    const patients = Array.isArray(resp?.content) ? resp.content : [];

    for (const p of patients) {
      const digitsList = patientPhonesDigits(p);

      // match exato ou match por final (caso haja lixo/DDD/normalização)
      // ex: "83999595583" deve bater com "...99595583" etc
      for (const d of digitsList) {
        if (!d) continue;
        if (d === targetDigits) return p;
        if (d.endsWith(targetDigits)) return p;
        if (targetDigits.endsWith(d)) return p;
      }
    }

    // se não veio nada, acabou
    if (!patients.length) break;
  }

  return null;
}

export async function runRPC(op, data = {}) {
  try {
    // -------------------------
    // PATIENT.SEARCH (TURBO)
    // -------------------------
    if (op === "patient.search") {
      const argumentRaw = data?.argument ?? "";
      const argDigits = normalizeBRPhoneDigits(argumentRaw);

      // Se parece telefone, NÃO confia no "argument" do Clinicall (ele não busca por telefone)
      const isPhone = looksLikePhone(argDigits);

      // 1) Se NÃO é telefone: tenta busca normal (CPF/Nome etc)
      if (!isPhone) {
        const r = await clinicall.request("/partners/patient/search", {
          method: "POST",
          body: {
            argument: String(argumentRaw || ""),
            page: Number.isFinite(data?.page) ? data.page : 0,
            sizePage: Number.isFinite(data?.sizePage) ? data.sizePage : 25,
            fieldSort: data?.fieldSort ?? "name",
            sortDirection: data?.sortDirection ?? "asc",
          },
        });

        const list = Array.isArray(r?.content) ? r.content : [];
        if (!list.length) {
          return contract.fallback({
            message: "Não encontrei seu cadastro. Me diga seu nome completo.",
            nextAction: "create_patient",
          });
        }

        const patient = list[0];
        return contract.ok({
          data: { id: patient.id ?? null, name: patient.name ?? "" },
          nextAction: "patient_found",
        });
      }

      // 2) Se É telefone: tenta scan local (mais confiável)
      //    Também evita SYSTEM_EXCEPTION do Clinicall ao tentar buscar por telefone.
      let patient = null;

      try {
        patient = await scanPatientByPhone(argDigits, { maxPages: 15, sizePage: 50 });
      } catch (e) {
        // Se o scan falhar por qualquer instabilidade do Clinicall, devolve mensagem neutra (sem loop)
        return contract.error("Instabilidade temporária");
      }

      if (!patient) {
        return contract.fallback({
          message: "Não encontrei seu cadastro. Me diga seu nome completo.",
          nextAction: "create_patient",
        });
      }

      return contract.ok({
        data: { id: patient.id ?? null, name: patient.name ?? "" },
        nextAction: "patient_found",
      });
    }

    // -------------------------
    // PROFESSIONAL.SEARCH
    // -------------------------
    if (op === "professional.search") {
      const r = await clinicall.request("/partners/performer/search", {
        method: "POST",
        body: data,
      });

      const list = Array.isArray(r?.content) ? r.content : [];

      if (!list.length) {
        return contract.fallback({
          message: "Não encontrei esse profissional. Vou te mostrar as especialidades disponíveis.",
          nextAction: "choose_speciality",
        });
      }

      return contract.ok({
        options: topOptions(list, (p) => ({
          id: p.id ?? p.performerId ?? null,
          label: p.name ?? p.fullName ?? "Profissional",
        })),
        nextAction: "choose_professional",
      });
    }

    // -------------------------
    // SCHEDULE.SEARCH
    // -------------------------
    if (op === "schedule.search") {
      const r = await clinicall.request("/partners/schedule/v2/search", {
        method: "POST",
        body: data,
      });

      const list = Array.isArray(r?.content) ? r.content : [];

      if (!list.length) {
        return contract.fallback({
          message: "Não encontrei horários disponíveis. Vou ampliar a busca.",
          nextAction: "expand_schedule_search",
        });
      }

      return contract.ok({
        data: list,
        nextAction: "choose_schedule",
      });
    }

    // fallback padrão se operação não existe
    return contract.error("Operação inválida");
  } catch (err) {
    console.error("RPC ENGINE ERROR:");
    console.error(err?.message);
    console.error(err?.stack);

    return contract.error(err?.message || "Instabilidade temporária");
  }
}
