/**
 * First Admin on a new **development** instance when `users` is empty and
 * `BOOTSTRAP_ADMIN_*` is unset. Production never uses these — it requires
 * explicit env. Password is documented in `docs/DEVELOPMENT.md`.
 */
export const DEV_BOOTSTRAP_ADMIN_EMAIL = "admin@opentcm.io";
export const DEV_BOOTSTRAP_ADMIN_PASSWORD = "opentcm-admin";

type EnvLike = Record<string, string | undefined>;

function envTrimmed(name: string, env: EnvLike): string | undefined {
  const value = env[name];
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Resolve first-Admin credentials. Both env vars win when set. A partial
 * pair is treated as missing (do not silently fill one side). In
 * `NODE_ENV=development` only, an unset pair falls back to
 * {@link DEV_BOOTSTRAP_ADMIN_EMAIL} / {@link DEV_BOOTSTRAP_ADMIN_PASSWORD}.
 */
export function resolveBootstrapCredentials(
  env: EnvLike = process.env,
): { email: string; password: string } | null {
  const emailRaw = envTrimmed("BOOTSTRAP_ADMIN_EMAIL", env);
  const passwordRaw = envTrimmed("BOOTSTRAP_ADMIN_PASSWORD", env);
  if (emailRaw && passwordRaw) {
    return { email: emailRaw, password: passwordRaw };
  }
  if (emailRaw || passwordRaw) {
    return null;
  }
  if (env.NODE_ENV === "development") {
    return {
      email: DEV_BOOTSTRAP_ADMIN_EMAIL,
      password: DEV_BOOTSTRAP_ADMIN_PASSWORD,
    };
  }
  return null;
}
