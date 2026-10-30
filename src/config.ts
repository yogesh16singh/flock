export type Config = {
  mongodbUri: string;
  portalBaseUrl: string;
  portalEmail: string;
  portalPassword: string;
  port: number;
  ttlSeconds: number;
  registerTtlSeconds: number;
  pacePerMinute: number;
  portalOffsetMinutes: number;
};

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}. Copy .env.example to .env and set it.`);
  return value;
}

function integer(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    mongodbUri: required(env, "CATALOG_MONGODB_URI"),
    portalBaseUrl: (env.CATALOG_PORTAL_BASE_URL?.trim() || "https://urja-ops.flockenergy.tech").replace(/\/$/, ""),
    portalEmail: required(env, "CATALOG_PORTAL_EMAIL"),
    portalPassword: required(env, "CATALOG_PORTAL_PASSWORD"),
    port: integer(env, "CATALOG_PORT", 8080),
    ttlSeconds: integer(env, "CATALOG_TTL_SECONDS", 900),
    registerTtlSeconds: integer(env, "CATALOG_REGISTER_TTL_SECONDS", 600),
    pacePerMinute: integer(env, "CATALOG_PACE_PER_MINUTE", 90),
    portalOffsetMinutes: integer(env, "CATALOG_PORTAL_UTC_OFFSET_MINUTES", 330),
  };
}
