// src/orchestrator/fallback.js
import { fallback } from "./contract.js";

export function emptyProfessionals() {
  return fallback({
    message: "Não encontrei profissionais com esse critério. Vou te mostrar as especialidades disponíveis.",
    options: [],
    nextAction: "choose_speciality",
  });
}

export function emptySchedule() {
  return fallback({
    message: "Agenda cheia para os próximos dias. Posso buscar em outro período ou com outro profissional.",
    options: [],
    nextAction: "retry_schedule",
  });
}

export function patientNotFound() {
  return fallback({
    message: "Não encontrei cadastro com esses dados. Posso fazer o cadastro agora se quiser.",
    options: [],
    nextAction: "offer_patient_create",
  });
}

export function noAccreditation() {
  return fallback({
    message: "Esse convênio pode não cobrir este procedimento. Deseja verificar como particular?",
    options: [],
    nextAction: "suggest_particular",
  });
}
