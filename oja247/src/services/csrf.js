let csrfToken = null;

export function rememberCsrfToken(response) {
  const nextToken = response?.headers?.["x-csrf-token"];
  if (typeof nextToken === "string" && nextToken) csrfToken = nextToken;
  return response;
}

export function attachCsrfToken(config) {
  if (!["get", "head", "options"].includes(String(config.method || "get").toLowerCase()) && csrfToken) {
    config.headers["X-CSRF-Token"] = csrfToken;
  }
  return config;
}

export function clearCsrfToken() {
  csrfToken = null;
}