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
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  return d;
}

export async function runRPC(op, data = {}) {
  try {
    // -------------------------
// PATIENT.SEARCH (turbo)
// -------------------------
if (op === "patient.search") {
  const argumentRaw = data?.argument ?? "";
  const argumentDigits = normalizeBRPhoneDigits(argumentRaw);

  const baseBody = {
    argument: argumentDigits || String(argumentRaw || ""),
    page: 0,
    sizePage: 25,
    fieldSort: "name",
    sortDirection: "asc",
  };

  // 1) tenta search normal
  let r = await clinicall.request("/partners/patient/search", {
    method: "POST",
    body: baseBody,
  });

  let list = Array.isArray(r?.content) ? r.content : [];

  // 2) se vazio → scan por telefone
  if (!list.length && argumentDigits.length >= 10) {
    const target = argumentDigits;

    for (let page = 0; page < 10; page++) {
      const scan = await clinicall.request("/partners/patient/search", {
        method: "POST",
        body: { ...baseBody, argument: "", page },
      });

      const patients = Array.isArray(scan?.content) ? scan.content : [];

      for (const p of patients) {
        const phones = [
          p.phoneStandard,
          p.phone,
          p.cellphone,
          p.telephone,
        ];

        for (const ph of phones) {
          const d = normalizeBRPhoneDigits(ph);
          if (d && d.endsWith(target)) {
            list = [p];
            break;
          }
        }

        if (list.length) break;
      }

      if (list.length || !patients.length) break;
    }
  }

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

    return {
      status: "error",
      message: err?.message || "Instabilidade temporária",
    };
  }
}
