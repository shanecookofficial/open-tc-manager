/**
 * Next.js server boot hook. Creates the first Admin when the users table
 * is empty (BOOTSTRAP_* env, or the development default admin@opentcm.io).
 * No-op on the Edge runtime. Does not seed projects or cases.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  const { bootstrapAdminIfEmpty } = await import("./lib/api/auth");
  await bootstrapAdminIfEmpty();
}
