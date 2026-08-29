import {
  directoryDeleteQuerySchema,
  directoryIdParamSchema,
  patchDirectoryBodySchema,
} from "@/lib/contracts";
import { deleteDirectory, updateDirectory } from "@/lib/api/directories";
import { apiHandler } from "@/lib/api/handler";
import { requireActor } from "@/lib/api/history";
import { json } from "@/lib/api/http";

export const PATCH = apiHandler(
  { params: directoryIdParamSchema, body: patchDirectoryBodySchema },
  async ({ params, body }) => json(await updateDirectory(params.id, body)),
  { auth: "member" },
);

export const DELETE = apiHandler(
  { params: directoryIdParamSchema, query: directoryDeleteQuerySchema },
  async ({ params, query, user }) =>
    json(await deleteDirectory(params.id, query.mode, requireActor(user))),
  { auth: "member" },
);
