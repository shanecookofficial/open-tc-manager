import { bulkSelectionWithProjectSchema } from "@/lib/contracts";
import { apiHandler } from "@/lib/api/handler";
import { json } from "@/lib/api/http";
import { bulkTrash } from "@/lib/api/trash";

export const POST = apiHandler(
  { body: bulkSelectionWithProjectSchema },
  async ({ body }) => json(await bulkTrash(body)),
  { auth: "member" },
);
