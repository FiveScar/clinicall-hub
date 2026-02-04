// src/orchestrator/rpcEngine.js
import clinicall from "../clinicall/client.js";
import * as contract from "./contract.js";

function topOptions(list, mapper, limit = 3) {
  return (Array.isArray(list) ? list : []).slice(0, limit).map(mapper);
}

export async function runRPC(op, data = {}) {
  try {
    // -------------------------
    // PATIENT.SEARCH
    // data: { argument }
    // -------------------------
    if (op === "patient.search") {
      const r = await clinicall.request("/patients/search", {
        method: "POST",
        body: data,
      });

      const list = r?.content || [];

      if (!list.length) {
        return contract.fallback({
          message: "Não encontrei seu cadastro.",
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
    // PROFESSIONAL.SEARCH
    // data: { argument, page, sizePage, fieldSort, sortDirection }
    // -------------------------
    if (op === "professional.search") {
      const r = await clinicall.request("/professionals/search", {
        method: "POST",
        body: data,
      });

      const list = r?.content || [];

      if (!list.length) {
        return contract.fallback({
          message: "Não encontrei esse profissional. Vou te mostrar as especialidades disponíveis.",
          nextAction: "choose_speciality",
        });
      }

      return contract.ok({
        options: topOptions(list, (p) => ({
          id: p.id ?? null,
          label: p.name ?? "Profissional",
          meta: { specialityId: p.specialityId ?? null },
        })),
        nextAction: "choose_professional",
      });
    }

    // -------------------------
    // SCHEDULE.SEARCH
    // data: { ... filtros do seu backend ... }
    // -------------------------
    if (op === "schedule.search") {
      const r = await clinicall.request("/schedule/search", {
        method: "POST",
        body: data,
      });

      const list = r?.content || [];

      if (!list.length) {
        return contract.fallback({
          message: "Não encontrei horários disponíveis nesse período. Vou ampliar a busca.",
          nextAction: "retry_schedule",
        });
      }

      // OBS: como o formato do item de agenda pode variar por tenant,
      // eu só monto um label seguro com o que existir.
      return contract.ok({
        options: topOptions(list, (s) => {
          const date = s.date || s.started || s.startDate || s.day || "";
          const time = s.time || s.hour || s.startedHour || "";
          const label = [date, time].filter(Boolean).join(" às ") || "Horário disponível";

          return {
            id: s.id ?? s.scheduleId ?? null,
            label,
            meta: {
              performerId: s.performerId ?? null,
              companyId: s.companyId ?? null,
            },
          };
        }),
        nextAction: "choose_schedule",
      });
    }

    // -------------------------
    // DEFAULT
    // -------------------------
    return contract.error("Operação não suportada");
  } catch (err) {
  console.error("RPC ENGINE ERROR:");
  console.error(err?.message);
  console.error(err?.stack);

  return {
    status: "error",
    message: err?.message || "Instabilidade temporária"
  };
}
