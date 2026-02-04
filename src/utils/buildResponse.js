export default function buildResponse({
  ok = true,
  data = null,
  error = null,
  meta = {},
  requestId = null,
} = {}) {
  return {
    ok,
    data,
    error,
    meta: {
      requestId,
      ...(meta || {}),
    },
  };
}
