import { apiHandler } from "@/lib/api/handler";
import { json } from "@/lib/api/http";
import {
  requireSession,
  sessionCookieHeader,
  touchSession,
} from "@/lib/api/session";

export const GET = apiHandler({}, async ({ request }) => {
  const session = await requireSession(request);
  await touchSession(session.sessionId);
  return json({ user: session.user }, 200, {
    "Set-Cookie": sessionCookieHeader(session.token),
  });
});
