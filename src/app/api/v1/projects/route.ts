import { createProjectBodySchema } from "@/lib/contracts";
import { apiHandler } from "@/lib/api/handler";
import { created, json } from "@/lib/api/http";
import { createProject, listProjects } from "@/lib/api/projects";

export const GET = apiHandler({}, async () => json(await listProjects()));

export const POST = apiHandler(
  { body: createProjectBodySchema },
  async ({ body }) => {
    const project = await createProject(body);
    return created(project, `/api/v1/projects/${project.id}`);
  },
  { auth: "projects.write" },
);
