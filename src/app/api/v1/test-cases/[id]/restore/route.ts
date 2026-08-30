import { testCaseIdParamSchema } from "@/lib/contracts";
import { apiHandler } from "@/lib/api/handler";
import { requireActor } from "@/lib/api/history";
import { json } from "@/lib/api/http";
import { restoreTestCase } from "@/lib/api/trash";

export const POST = apiHandler(
  { params: testCaseIdParamSchema },
  async ({ params, user }) =>
    json(await restoreTestCase(params.id, requireActor(user))),
  { auth: "cases.write" },
);
