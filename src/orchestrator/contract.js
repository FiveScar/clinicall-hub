export function ok({ data = {}, options = [], nextAction = "done", message } = {}) {
  return { status: "ok", data, options, nextAction, message };
}

export function fallback({ message, options = [], nextAction = "retry" }) {
  return { status: "fallback", message, options, nextAction };
}

export function error(message = "Instabilidade temporária") {
  return { status: "error", message };
}
