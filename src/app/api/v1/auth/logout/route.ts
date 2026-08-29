import { z } from "zod";

import { logoutSession } from "@/lib/api/auth";
import { apiHandler } from "@/lib/api/handler";
import { noContent } from "@/lib/api/http";
import { requireSession } from "@/lib/api/session";

export const POST = apiHandler(
  { body: z.strictObject({}), bodyOptional: true },
  async ({ request }) => {
    const session = await requireSession(request);
    const { cookie } = await logoutSession(session.sessionId);
    return noContent({ "Set-Cookie": cookie });
  },
);
