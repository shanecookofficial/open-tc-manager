import { ApiError } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { json } from "@/lib/api/http";

export const GET = apiHandler({}, async ({ user }) => {
  if (!user) {
    throw new ApiError("UNAUTHENTICATED", "Sign in to continue.");
  }
  return json({ user });
});
