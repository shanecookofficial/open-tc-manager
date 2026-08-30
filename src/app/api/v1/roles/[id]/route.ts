import { patchRoleBodySchema, roleIdParamSchema } from "@/lib/contracts";
import { apiHandler } from "@/lib/api/handler";
import { json, noContent } from "@/lib/api/http";
import { deleteRole, updateRole } from "@/lib/api/role-records";

export const PATCH = apiHandler(
  { params: roleIdParamSchema, body: patchRoleBodySchema },
  async ({ params, body }) => json(await updateRole(params.id, body)),
  { auth: "admin" },
);

export const DELETE = apiHandler(
  { params: roleIdParamSchema },
  async ({ params }) => {
    await deleteRole(params.id);
    return noContent();
  },
  { auth: "admin" },
);
