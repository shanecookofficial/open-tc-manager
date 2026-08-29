import { createUserBodySchema } from "@/lib/contracts";
import { apiHandler } from "@/lib/api/handler";
import { created, json } from "@/lib/api/http";
import { createUser, listUsers } from "@/lib/api/users";

export const GET = apiHandler({}, async () => json(await listUsers()), {
  auth: "admin",
});

export const POST = apiHandler(
  { body: createUserBodySchema },
  async ({ body }) => {
    const user = await createUser(body);
    return created(user, `/api/v1/users/${user.id}`);
  },
  { auth: "admin" },
);
