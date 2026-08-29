import { bulkSelectionWithProjectSchema } from "@/lib/contracts";
import { apiHandler } from "@/lib/api/handler";
import { requireActor } from "@/lib/api/history";
import { json } from "@/lib/api/http";
import { bulkRestore } from "@/lib/api/trash";

export const POST = apiHandler(
  { body: bulkSelectionWithProjectSchema },
  async ({ body, user }) => json(await bulkRestore(body, requireActor(user))),
  { auth: "member" },
);
