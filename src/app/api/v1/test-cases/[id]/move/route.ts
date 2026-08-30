import { moveTestCaseBodySchema, testCaseIdParamSchema } from "@/lib/contracts";
import { apiHandler } from "@/lib/api/handler";
import { requireActor } from "@/lib/api/history";
import { json } from "@/lib/api/http";
import { moveTestCase } from "@/lib/api/test-cases";

export const PATCH = apiHandler(
  { params: testCaseIdParamSchema, body: moveTestCaseBodySchema },
  async ({ params, body, user }) =>
    json(await moveTestCase(params.id, body, requireActor(user))),
  { auth: "cases.write" },
);
