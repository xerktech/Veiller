const SECRET_KEYS = new Set([
  "token",
  "apiKey",
  "api_key",
  "hashedApiKey",
  "authorization",
  "VEILLER_CLI_TOKEN",
  "VEILLER_AGENT_API_KEY",
  "VEILLER_ADMIN_JWT",
  "VEILLER_ADMIN_TOKEN",
]);

export function redactSecrets<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item)) as T;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEYS.has(key)) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = redactSecrets(val);
      }
    }
    return out as T;
  }
  return value;
}
