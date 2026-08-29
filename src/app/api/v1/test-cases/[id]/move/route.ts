import { moveTestCaseBodySchema, testCaseIdParamSchema } from "@/lib/contracts";
import { apiHandler } from "@/lib/api/handler";
import { json } from "@/lib/api/http";
import { moveTestCase } from "@/lib/api/test-cases";

export const PATCH = apiHandler(
  { params: testCaseIdParamSchema, body: moveTestCaseBodySchema },
  async ({ params, body }) => json(await moveTestCase(params.id, body)),
  { auth: "member" },
);
