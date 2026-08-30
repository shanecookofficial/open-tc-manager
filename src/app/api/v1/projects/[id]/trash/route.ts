import { projectIdParamSchema, trashListQuerySchema } from "@/lib/contracts";
import { apiHandler } from "@/lib/api/handler";
import { json } from "@/lib/api/http";
import { listTrash } from "@/lib/api/trash";

export const GET = apiHandler(
  { params: projectIdParamSchema, query: trashListQuerySchema },
  async ({ params, query }) => json(await listTrash(params.id, query)),
);
