/**
 * Next.js server boot hook. Creates the first Admin from BOOTSTRAP_* env
 * when the users table is empty. No-op on the Edge runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  const { bootstrapAdminIfEmpty } = await import("./lib/api/auth");
  await bootstrapAdminIfEmpty();
}
