import { patchProjectBodySchema, projectIdParamSchema } from "@/lib/contracts";
import { apiHandler } from "@/lib/api/handler";
import { json, noContent } from "@/lib/api/http";
import { deleteProject, updateProject } from "@/lib/api/projects";

export const PATCH = apiHandler(
  { params: projectIdParamSchema, body: patchProjectBodySchema },
  async ({ params, body }) => json(await updateProject(params.id, body)),
  { auth: "admin" },
);

export const DELETE = apiHandler(
  { params: projectIdParamSchema },
  async ({ params }) => {
    await deleteProject(params.id);
    return noContent();
  },
  { auth: "admin" },
);
