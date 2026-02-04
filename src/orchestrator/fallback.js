import { fallback } from "./contract.js";

export function emptyProfessionals() {
  return fallback(
    "Vou te mostrar as especialidades disponíveis.",
    [],
    "choose_speciality"
  );
}

export function emptySchedule() {
  return fallback(
    "Agenda cheia para os próximos dias.",
    [],
    "retry"
  );
}
