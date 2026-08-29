import { bulkSelectionSchema, projectIdParamSchema } from "@/lib/contracts";
import { apiHandler } from "@/lib/api/handler";
import { json } from "@/lib/api/http";
import { purgeTrash } from "@/lib/api/trash";

export const POST = apiHandler(
  { params: projectIdParamSchema, body: bulkSelectionSchema },
  async ({ params, body }) => json(await purgeTrash(params.id, body)),
);
