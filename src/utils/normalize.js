export const onlyDigits = (v) => String(v ?? "").replace(/\D+/g, "");

export const normalizeCpf = (cpf) => {
  const d = onlyDigits(cpf);
  return d || null;
};

export const normalizePhone = (phone) => {
  const d = onlyDigits(phone);
  return d || null;
};

export const normalizeEmail = (email) =>
  String(email ?? "").trim().toLowerCase() || null;

export function normalizePatient(p = {}) {
  return {
    ...p,
    cpf: normalizeCpf(p.cpf),
    phoneStandart: normalizePhone(p.phoneStandart ?? p.phone),
    email: normalizeEmail(p.email),
    name: String(p.name ?? "").trim(),
  };
}
