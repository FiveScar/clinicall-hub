// src/orchestrator/rpcEngine.js
import clinicall from "../clinicall/client.js";
import * as contract from "./contract.js";

/**
 * Helpers
 */
function norm(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // remove pontuação
    .replace(/\s+/g, " ")
    .trim();
}

function topOptions(list, mapper, limit = 3) {
  return list.slice(0, limit).map(mapper);
}

// Levenshtein simples
function levenshtein(a, b) {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (!al) return bl;
  if (!bl) return al;

  const v0 = new Array(bl + 1).fill(0);
  const v1 = new Array(bl + 1).fill(0);

  for (let i = 0; i <= bl; i++) v0[i] = i;

  for (let i = 0; i < al; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < bl; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= bl; j++) v0[j] = v1[j];
  }
  return v1[bl];
}

function scoreMatch(query, label) {
  const q = norm(query);
  const l = norm(label);

  if (!q || !l) return 0;

  if (l === q) return 100;
  if (l.includes(q)) return 90;
  if (q.includes(l)) return 80;

  const dist = levenshtein(q, l);
  const maxLen = Math.max(q.length, l.length) || 1;
  const sim = 1 - dist / maxLen;

  return Math.round(sim * 70);
}

function pickBest(query, items, labelFn) {
  const scored = items
    .map((it) => ({ it, s: scoreMatch(query, labelFn(it) || "") }))
    .sort((a, b) => b.s - a.s);

  const best = scored[0];
  const top3 = scored.slice(0, 3);

  return { best, top3 };
}

async function safeSearch(path, body) {
  const r1 = await clinicall.request(path, { method: "POST", body });
  const list1 = Array.isArray(r1?.content) ? r1.content : [];
  if (list1.length) return { raw: r1, list: list1, usedFallback: false };

  const body2 = {
    ...body,
    argument: body?.argument ? body.argument : "a",
    page: 0,
    sizePage: Math.max(body?.sizePage || 25, 200),
  };

  const r2 = await clinicall.request(path, { method: "POST", body: body2 });
  const list2 = Array.isArray(r2?.content) ? r2.content : [];
  return { raw: r2, list: list2, usedFallback: true };
}

// Normalização leve do payload de agenda (igual ao schedules.routes.js)
function buildSchedulePayload(input = {}) {
  const { patientId, doctorId, date, time, ...rest } = input;

  const normalized = {
    ...rest,
    patientId: patientId ?? rest.patientId,
    performerId: doctorId ?? rest.performerId,
  };

  if (!normalized.started && date && time) {
    normalized.started = `${date}T${time}`;
  }

  return normalized;
}

/**
 * RPC Engine
 * IMPORTANTE: NÃO existe busca por telefone na Clinicall.
 * Portanto, NÃO fazemos qualquer heurística/consulta por telefone aqui.
 */
export async function runRPC(op, data = {}) {
  op = String(op || "").trim();

  try {
    // -------------------------
    // PATIENT.SEARCH (CPF ou NOME) — SEM telefone
    // -------------------------
    if (op === "patient.search") {
      const argument = String(data?.argument || "").trim();

      if (!argument) {
        return contract.fallback({
          message: "Perfeito. Para localizar seu cadastro, me informe seu nome completo e CPF.",
          nextAction: "ask_name_cpf",
        });
      }

      const body = {
        argument,
        page: 0,
        sizePage: 25,
        fieldSort: "name",
        sortDirection: "asc",
      };

      const r = await clinicall.request("/partners/patient/search", {
        method: "POST",
        body,
      });

      const list = Array.isArray(r?.content) ? r.content : [];

      if (!list.length) {
        return contract.ok({
          message:
            "Certo. Não encontrei cadastro com esses dados. Me confirme nome completo e CPF para eu localizar certinho (ou fazer o cadastro).",
          data: [],
          nextAction: "patient_not_found",
        });
      }

      if (list.length > 1) {
        return contract.ok({
          message: "Entendi. Encontrei mais de um cadastro com dados parecidos. Qual é o seu?",
          options: topOptions(list, (p) => ({
            id: p.id ?? null,
            label: `${p.name || "Paciente"}${p.cpf ? " — CPF " + p.cpf : ""}`,
          })),
          nextAction: "choose_patient",
        });
      }

      return contract.ok({
        data: list[0],
        nextAction: "patient_found",
      });
    }

    // -------------------------
    // SPECIALITY.SEARCH (semântica/fuzzy)
    // -------------------------
    if (op === "speciality.search") {
      const argument = String(data?.argument || "").trim();

      if (!argument) {
        const { list } = await safeSearch("/partners/speciality/search", {
          argument: "a",
          page: 0,
          sizePage: 50,
          fieldSort: "name",
          sortDirection: "asc",
        });

        return contract.ok({
          message: "Perfeito. Essas são algumas especialidades disponíveis. Qual você quer?",
          options: topOptions(list, (s) => ({
            id: s.id ?? null,
            label: s.name ?? "Especialidade",
          })),
          nextAction: "choose_speciality",
        });
      }

      const { list } = await safeSearch("/partners/speciality/search", {
        argument,
        page: 0,
        sizePage: 50,
        fieldSort: "name",
        sortDirection: "asc",
      });

      if (!list.length) {
        return contract.ok({
          message:
            "Certo. Não encontrei essa especialidade com esse nome. Você pode me dizer com qual tipo de consulta você quer agendar?",
          data: [],
          nextAction: "speciality_not_found",
        });
      }

      const { best, top3 } = pickBest(argument, list, (s) => s.name || "");
      const bestItem = best?.it;
      const bestScore = best?.s ?? 0;

      if (bestItem && bestScore >= 90) {
        return contract.ok({
          data: { id: bestItem.id, name: bestItem.name },
          nextAction: "speciality_selected",
        });
      }

      return contract.ok({
        message: "Entendi. Encontrei estas opções. Qual delas você quer?",
        options: top3.map(({ it }) => ({
          id: it.id ?? null,
          label: it.name ?? "Especialidade",
        })),
        nextAction: "choose_speciality",
      });
    }

    // -------------------------
    // PROFESSIONAL.SEARCH (anti-loop + semântica)
    // Observação: aqui usa /partners/performer/search (executantes)
    // -------------------------
    if (op === "professional.search") {
      const argument = String(data?.argument || "").trim();
      const specialityId = data?.specialityId ?? data?.specialtyId ?? null;

      if (!argument && !specialityId) {
        const { list } = await safeSearch("/partners/speciality/search", {
          argument: "a",
          page: 0,
          sizePage: 50,
          fieldSort: "name",
          sortDirection: "asc",
        });

        return contract.ok({
          message: "Perfeito. Para eu te mostrar os profissionais, me diga qual especialidade você quer.",
          options: topOptions(list, (s) => ({ id: s.id ?? null, label: s.name ?? "Especialidade" })),
          nextAction: "choose_speciality_for_professional",
        });
      }

      // 1) busca por nome do profissional
      if (argument) {
        const r = await clinicall.request("/partners/performer/search", {
          method: "POST",
          body: {
            argument,
            page: 0,
            sizePage: 25,
            fieldSort: "name",
            sortDirection: "asc",
          },
        });

        const list = Array.isArray(r?.content) ? r.content : [];
        if (list.length) {
          return contract.ok({
            options: topOptions(list, (p) => ({
              id: p.id ?? p.performerId ?? null,
              label: p.name ?? p.fullName ?? "Profissional",
            })),
            nextAction: "choose_professional",
          });
        }
      }

      // 2) profissionais por especialidadeId
      if (specialityId) {
        const r = await clinicall.request("/partners/performer/search", {
          method: "POST",
          body: {
            argument: "",
            specialityId,
            page: 0,
            sizePage: 25,
            fieldSort: "name",
            sortDirection: "asc",
          },
        });

        const list = Array.isArray(r?.content) ? r.content : [];
        if (list.length) {
          return contract.ok({
            options: topOptions(list, (p) => ({
              id: p.id ?? p.performerId ?? null,
              label: p.name ?? p.fullName ?? "Profissional",
            })),
            nextAction: "choose_professional",
          });
        }
      }

      // 3) tenta interpretar o termo como especialidade e listar profissionais dela
      if (argument) {
        const { list: specList } = await safeSearch("/partners/speciality/search", {
          argument,
          page: 0,
          sizePage: 50,
          fieldSort: "name",
          sortDirection: "asc",
        });

        if (specList.length) {
          const { best, top3 } = pickBest(argument, specList, (s) => s.name || "");
          const bestSpec = best?.it;

          if (bestSpec) {
            const r = await clinicall.request("/partners/performer/search", {
              method: "POST",
              body: {
                argument: "",
                specialityId: bestSpec.id,
                page: 0,
                sizePage: 25,
                fieldSort: "name",
                sortDirection: "asc",
              },
            });

            const list = Array.isArray(r?.content) ? r.content : [];
            if (list.length) {
              return contract.ok({
                message: `Perfeito. Encontrei profissionais de ${bestSpec.name}. Qual você prefere?`,
                options: topOptions(list, (p) => ({
                  id: p.id ?? p.performerId ?? null,
                  label: p.name ?? p.fullName ?? "Profissional",
                })),
                nextAction: "choose_professional",
              });
            }

            return contract.ok({
              message: "Certo. Não encontrei profissionais para essa opção. Quer tentar uma destas especialidades?",
              options: top3.map(({ it }) => ({ id: it.id ?? null, label: it.name ?? "Especialidade" })),
              nextAction: "choose_speciality_for_professional",
            });
          }
        }
      }

      return contract.ok({
        message: "Certo. Não consegui localizar profissionais agora. Me diga qual especialidade você quer agendar.",
        data: [],
        nextAction: "ask_speciality",
      });
    }

    // -------------------------
    // SCHEDULE.SEARCH
    // -------------------------
    if (op === "schedule.search") {
      const payload = buildSchedulePayload(data || {});
      const r = await clinicall.request("/partners/schedule/v2/search", {
        method: "POST",
        body: payload,
      });

      const list = Array.isArray(r?.content) ? r.content : [];

      if (!list.length) {
        return contract.ok({
          message: "Entendi. Não encontrei horários nessa janela. Quer que eu amplie o período?",
          data: [],
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

    // -------------------------
    // SCHEDULE.BOOK (criar agendamento)
    // -------------------------
    if (op === "schedule.book") {
      const payload = buildSchedulePayload(data || {});
      if (!payload?.patientId || !payload?.performerId || !payload?.started) {
        return contract.fallback({
          message: "Perfeito. Para marcar, preciso do paciente, do profissional e do horário.",
          nextAction: "ask_missing_booking_fields",
        });
      }

      const created = await clinicall.request("/partners/schedule", {
        method: "POST",
        body: payload,
      });

      return contract.ok({
        data: created,
        nextAction: "schedule_booked",
      });
    }

    // -------------------------
    // SCHEDULE.RESCHEDULE (remarcar)
    // -------------------------
    if (op === "schedule.reschedule") {
      const payload = buildSchedulePayload(data || {});
      if (!payload?.id && !payload?.scheduleId) {
        return contract.fallback({
          message: "Certo. Para remarcar, preciso do identificador da consulta.",
          nextAction: "ask_schedule_id",
        });
      }

      // normalize id field
      if (!payload.id && payload.scheduleId) payload.id = payload.scheduleId;

      const updated = await clinicall.request("/partners/schedule", {
        method: "PUT",
        body: payload,
      });

      return contract.ok({
        data: updated,
        nextAction: "schedule_rescheduled",
      });
    }

    // -------------------------
    // SCHEDULE.CONFIRM (confirmar) — com fallback igual ao schedules.routes.js
    // -------------------------
    if (op === "schedule.confirm") {
      const rawId = data?.id ?? data?.scheduleId;
      const id = Number(rawId) || rawId;

      if (!id) {
        return contract.fallback({
          message: "Certo. Para confirmar, preciso do identificador da consulta.",
          nextAction: "ask_schedule_id",
        });
      }

      try {
        const confirmed = await clinicall.request("/partners/scheduleConfirm", {
          method: "POST",
          body: { scheduleId: id },
        });

        return contract.ok({
          data: confirmed,
          nextAction: "schedule_confirmed",
        });
      } catch {
        const fallback = await clinicall.request(`/partners/${encodeURIComponent(String(id))}/patientStatus/C`, {
          method: "POST",
        });

        return contract.ok({
          data: fallback,
          nextAction: "schedule_confirmed",
        });
      }
    }

    // -------------------------
    // SCHEDULE.CANCEL (cancelar) — com fallback igual ao schedules.routes.js
    // -------------------------
    if (op === "schedule.cancel") {
      const rawId = data?.scheduleId ?? data?.id;
      const id = Number(rawId) || rawId;

      if (!id) {
        return contract.fallback({
          message: "Certo. Para cancelar, preciso do identificador da consulta.",
          nextAction: "ask_schedule_id",
        });
      }

      try {
        const cancelled = await clinicall.request("/partners/scheduleCancel", {
          method: "POST",
          body: { scheduleId: id },
        });

        return contract.ok({
          data: cancelled,
          nextAction: "schedule_cancelled",
        });
      } catch {
        const fallback = await clinicall.request(`/partners/${encodeURIComponent(String(id))}/patientStatus/B`, {
          method: "POST",
        });

        return contract.ok({
          data: fallback,
          nextAction: "schedule_cancelled",
        });
      }
    }

    return contract.error("Operação não suportada");
  } catch (err) {
    console.error("RPC ENGINE ERROR:", err?.message || err);
    if (err?.stack) console.error(err.stack);

    return {
      status: "error",
      message: "Instabilidade temporária",
    };
  }
}
