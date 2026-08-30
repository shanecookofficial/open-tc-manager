import { patchUserBodySchema, userIdParamSchema } from "@/lib/contracts";
import { apiHandler } from "@/lib/api/handler";
import { json } from "@/lib/api/http";
import { updateUser } from "@/lib/api/users";

export const PATCH = apiHandler(
  { params: userIdParamSchema, body: patchUserBodySchema },
  async ({ params, body }) => json(await updateUser(params.id, body)),
  { auth: "admin" },
);
