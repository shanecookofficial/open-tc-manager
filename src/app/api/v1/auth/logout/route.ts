import { z } from "zod";

import { logoutSession } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { noContent } from "@/lib/api/http";

export const POST = apiHandler(
  { body: z.strictObject({}), bodyOptional: true },
  async ({ session }) => {
    if (!session) {
      throw new ApiError("UNAUTHENTICATED", "Sign in to continue.");
    }
    const { cookie } = await logoutSession(session.sessionId);
    return noContent({ "Set-Cookie": cookie });
  },
  { sliding: false },
);
