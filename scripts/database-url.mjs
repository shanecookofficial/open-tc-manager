/**
 * Resolve DATABASE_URL or discrete POSTGRES_* connectors.
 * Keep in sync with src/lib/db/database-url.ts.
 */
export const DATABASE_CONFIG_ERROR =
  "Database is not configured. Set DATABASE_URL, or set POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DB.";

function trimmed(env, name) {
  const value = env[name];
  if (value === undefined) {
    return undefined;
  }
  const next = String(value).trim();
  return next.length > 0 ? next : undefined;
}

function hostForUrl(host) {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

export function resolveDatabaseUrl(env = process.env) {
  const fromUrl = trimmed(env, "DATABASE_URL");
  if (fromUrl) {
    return fromUrl;
  }

  const host = trimmed(env, "POSTGRES_HOST");
  const user = trimmed(env, "POSTGRES_USER");
  const database = trimmed(env, "POSTGRES_DB");
  if (!host || !user || !database) {
    return null;
  }

  const password = env.POSTGRES_PASSWORD ?? "";
  const port = trimmed(env, "POSTGRES_PORT") ?? "5432";
  const sslmode = trimmed(env, "POSTGRES_SSLMODE");

  let url = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${hostForUrl(host)}:${port}/${database}`;
  if (sslmode) {
    url += `?sslmode=${encodeURIComponent(sslmode)}`;
  }
  return url;
}

export function requireDatabaseUrl(env = process.env) {
  const url = resolveDatabaseUrl(env);
  if (!url) {
    throw new Error(DATABASE_CONFIG_ERROR);
  }
  return url;
}
