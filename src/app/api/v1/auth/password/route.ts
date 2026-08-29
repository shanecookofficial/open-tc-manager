import { changePasswordBodySchema } from "@/lib/contracts";
import { changeOwnPassword } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { noContent } from "@/lib/api/http";

export const POST = apiHandler(
  { body: changePasswordBodySchema },
  async ({ session, body }) => {
    if (!session) {
      throw new ApiError("UNAUTHENTICATED", "Sign in to continue.");
    }
    await changeOwnPassword(session.user.id, body);
    return noContent();
  },
);
