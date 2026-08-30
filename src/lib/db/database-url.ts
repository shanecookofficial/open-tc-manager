export const DATABASE_CONFIG_ERROR =
  "Database is not configured. Set DATABASE_URL, or set POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DB.";

export type EnvLike = Record<string, string | undefined>;

function trimmed(env: EnvLike, name: string): string | undefined {
  const value = env[name];
  if (value === undefined) {
    return undefined;
  }
  const next = value.trim();
  return next.length > 0 ? next : undefined;
}

function hostForUrl(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

/**
 * Resolve the Postgres connection string.
 * `DATABASE_URL` wins when set. Otherwise build it from discrete connectors.
 */
export function resolveDatabaseUrl(env: EnvLike = process.env): string | null {
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

export function requireDatabaseUrl(env: EnvLike = process.env): string {
  const url = resolveDatabaseUrl(env);
  if (!url) {
    throw new Error(DATABASE_CONFIG_ERROR);
  }
  return url;
}
