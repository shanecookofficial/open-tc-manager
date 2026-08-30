import { setupAdminBodySchema } from "@/lib/contracts";
import { completeAdminSetup } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { json } from "@/lib/api/http";

export const POST = apiHandler(
  { body: setupAdminBodySchema },
  async ({ session, body }) => {
    if (!session) {
      throw new ApiError("UNAUTHENTICATED", "Sign in to continue.");
    }
    const user = await completeAdminSetup(session.user.id, body);
    return json({ user });
  },
);
