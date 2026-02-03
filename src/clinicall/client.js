// src/clinicall/client.js

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }
}

export async function clinicallRequest(path, { method = "GET", body, headers = {} } = {}) {
  const url = `${BASE_URL}${path}`;
  let token = await getToken();

  const doFetch = async (tokenToUse) => {
    const resp = await fetch(url, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        "X-Auth-Token": tokenToUse,
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (resp.status === 401) return { resp, unauthorized: true };
    return { resp, unauthorized: false };
  };

  let { resp, unauthorized } = await doFetch(token);

  if (unauthorized) {
    cachedToken = null;
    token = await authenticate();
    const retry = await doFetch(token);
    resp = retry.resp;
  }

  const contentType = resp.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await resp.json().catch(() => null)
    : await resp.text().catch(() => "");

  if (!resp.ok) {
    // joga erro preservando status e payload do Clinicall
    throw new HttpError(
      resp.status,
      `Clinicall error ${resp.status}`,
      data
    );
  }

  return data;
}
