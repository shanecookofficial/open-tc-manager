import { createRoleBodySchema } from "@/lib/contracts";
import { apiHandler } from "@/lib/api/handler";
import { created, json } from "@/lib/api/http";
import { createRole, listRoles } from "@/lib/api/role-records";

export const GET = apiHandler({}, async () => json(await listRoles()), {
  auth: "admin",
});

export const POST = apiHandler(
  { body: createRoleBodySchema },
  async ({ body }) => {
    const role = await createRole(body);
    return created(role, `/api/v1/roles/${role.id}`);
  },
  { auth: "admin" },
);
