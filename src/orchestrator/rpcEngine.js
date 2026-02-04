import clinicall from "../clinicall/client.js";
import * as contract from "./contract.js";

function mapOptions(list, mapper) {
  return list.slice(0, 3).map(mapper);
}

export async function runRPC(op, data) {
  try {

    // -------------------------
    // PATIENT SEARCH
    // -------------------------
    if (op === "patient.search") {
      const r = await clinicall.request("/patients/search", {
        method: "POST",
        body: data,
      });

      const list = r?.content || [];

      if (!list.length) {
        return contract.fallback({
          message: "Cadastro não encontrado.",
          nextAction: "create_patient",
        });
      }

      const patient = list[0];

      return contract.ok({
        data: {
          id: patient.id,
          name: patient.name,
        },
        nextAction: "patient_found",
      });
    }

    // -------------------------
    // PROFESSIONAL SEARCH
    // -------------------------
    if (op === "professional.search") {
      const r = await clinicall.request("/professionals/search", {
        method: "POST",
        body: data,
      });

      const list = r?.content || [];

      if (!list.length) {
        return contract.fallback({
          message: "Vou te mostrar as especialidades disponíveis.",
          nextAction: "choose_speciality",
        });
      }

      return contract.ok({
        options: mapOptions(list, p => ({
          id: p.id,
          label: p.name,
        })),
        nextAction: "choose_professional",
      });
    }

    // -------------------------
    // SCHEDULE SEARCH
    // -------------------------
    if (op === "schedule.search") {
      const r = await clinicall.request("/schedule/search", {
        method: "POST",
        body: data,
      });

      const list = r?.content || [];

      if (!list.length) {
        return contract.fallback({
          message: "Agenda cheia para os próximos dias.",
          nextAction: "retry_schedule",
        });
      }

      return contract.ok({
        options: mapOptions(list, s => ({
          id: s.id,
          label: `${s.date} às ${s.time}`,
        })),
        nextAction: "choose_schedule",
      });
    }

    // -------------------------
    // DEFAULT
    // -------------------------
    return contract.error("Operação não suportada");

  } catch (err) {
  console.error("RPC ENGINE ERROR:");
  console.error(err);

  return contract.error(
    err?.message || "Instabilidade temporária"
  );
}

