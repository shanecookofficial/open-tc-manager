import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { resolveSessionFromToken } from "@/lib/api/session";
import { SESSION_COOKIE_NAME } from "@/lib/contracts";

/**
 * Server-side gate for every authenticated page.
 * Cookie presence is not enough — the session row must be valid.
 * Unauthenticated visitors are sent to /login and never render app chrome or data.
 */
export async function requirePageSession() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const session = await resolveSessionFromToken(token);
  if (session) {
    return session;
  }

  const path = (await headers()).get("x-opentcm-path");
  if (path && path !== "/" && !path.startsWith("/login")) {
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }
  redirect("/login");
}
