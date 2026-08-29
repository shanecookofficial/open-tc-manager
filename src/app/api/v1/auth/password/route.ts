import { changePasswordBodySchema } from "@/lib/contracts";
import { changeOwnPassword } from "@/lib/api/auth";
import { apiHandler } from "@/lib/api/handler";
import { noContent } from "@/lib/api/http";
import {
  requireSession,
  sessionCookieHeader,
  touchSession,
} from "@/lib/api/session";

export const POST = apiHandler(
  { body: changePasswordBodySchema },
  async ({ request, body }) => {
    const session = await requireSession(request);
    await changeOwnPassword(session.user.id, body);
    await touchSession(session.sessionId);
    return noContent({ "Set-Cookie": sessionCookieHeader(session.token) });
  },
);
