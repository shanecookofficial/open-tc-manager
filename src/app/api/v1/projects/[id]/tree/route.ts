import { projectIdParamSchema } from "@/lib/contracts";
import { getProjectTree } from "@/lib/api/directories";
import { apiHandler } from "@/lib/api/handler";
import { json } from "@/lib/api/http";

export const GET = apiHandler(
  { params: projectIdParamSchema },
  async ({ params }) => json(await getProjectTree(params.id)),
);
