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

function looksLikeBRPhone(digits) {
  // BR: 10 (DDD+8) ou 11 (DDD+9)
  return digits.length === 10 || digits.length === 11;
}

function extractPhoneDigitsFromPatient(p) {
  const candidates = [
    p?.phoneStandard,
    p?.phone,
    p?.cellphone,
    p?.telephone,
    p?.mobile,
    p?.whatsapp,
  ].filter(Boolean);

  return candidates.map(normalizeBRPhoneDigits).filter(Boolean);
}

async function safeClinicallRequest(path, body) {
  // protege para qualquer erro do Clinicall (500, timeout etc.)
  try {
    const r = await clinicall.request(path, { method: "POST", body });
    return { ok: true, data: r };
  } catch (e) {
    return { ok: false, error: e };
  }
}

async function scanPatientByPhone(targetDigits, opts = {}) {
  const sizePage = Number.isFinite(opts.sizePage) ? opts.sizePage : 50;
  const maxPages = Number.isFinite(opts.maxPages) ? opts.maxPages : 20;

  // IMPORTANTÍSSIMO:
  // - argument vazio pode derrubar alguns tenants (500)
  // - então tentamos "neutros" que costumam retornar lista
  const neutralArgs = ["a", "e", "o", "1", "0"];

  for (const neutral of neutralArgs) {
    // tenta varrer páginas com esse neutral
    for (let page = 0; page < maxPages; page++) {
      const body = {
        argument: neutral,
        page,
        sizePage,
        fieldSort: "name",
        sortDirection: "asc",
      };

      const res = await safeClinicallRequest("/partners/patient/search", body);
      if (!res.ok) {
        // se esse neutral causa erro, troca pro próximo neutral
        break;
      }

      const content = Array.isArray(res.data?.content) ? res.data.content : [];
      if (!content.length) {
        // acabou a lista
        break;
      }

      for (const p of content) {
        const phones = extractPhoneDigitsFromPatient(p);

        for (const ph of phones) {
          // match exato ou por final (caso normalizações diferentes)
          if (ph === targetDigits) return p;
          if (ph.endsWith(targetDigits)) return p;
          if (targetDigits.endsWith(ph)) return p;
        }
      }
    }
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
      const phoneDigits = normalizeBRPhoneDigits(argumentRaw);

      // Se parece telefone: NÃO chama Clinicall search com telefone (pode dar 500)
      if (looksLikeBRPhone(phoneDigits)) {
        const found = await scanPatientByPhone(phoneDigits, { maxPages: 20, sizePage: 50 });

        if (!found) {
          return contract.fallback({
            message: "Não encontrei seu cadastro. Me diga seu nome completo.",
            nextAction: "create_patient",
          });
        }

        return contract.ok({
          data: {
            id: found.id ?? null,
            name: found.name ?? "",
          },
          nextAction: "patient_found",
        });
      }

      // Se NÃO parece telefone: usa busca normal (CPF/Nome etc.)
      const body = {
        argument: String(argumentRaw || ""),
        page: Number.isFinite(data?.page) ? data.page : 0,
        sizePage: Number.isFinite(data?.sizePage) ? data.sizePage : 25,
        fieldSort: data?.fieldSort ?? "name",
        sortDirection: data?.sortDirection ?? "asc",
      };

      const r = await clinicall.request("/partners/patient/search", {
        method: "POST",
        body,
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
        data: {
          id: patient.id ?? null,
          name: patient.name ?? "",
        },
        nextAction: "patient_found",
      });
    }

    // -------------------------
    // PROFESSIONAL.SEARCH (mantém como está por enquanto)
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
    // SCHEDULE.SEARCH (mantém como está por enquanto)
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
          nextAction: "retry_schedule",
        });
      }

      return contract.ok({
        options: topOptions(list, (s) => {
          const date = s.date || s.started || s.startDate || s.day || "";
          const time = s.time || s.hour || s.startedHour || "";
          const label = [date, time].filter(Boolean).join(" às ") || "Horário disponível";

          return {
            id: s.id ?? s.scheduleId ?? null,
            label,
          };
        }),
        nextAction: "choose_schedule",
      });
    }

    return contract.error("Operação não suportada");
  } catch (err) {
    console.error("RPC ENGINE ERROR:", err?.message || err);
    if (err?.stack) console.error(err.stack);

    // mantém seu padrão atual de retorno
    return {
      status: "error",
      message: "Instabilidade temporária",
    };
  }
}
