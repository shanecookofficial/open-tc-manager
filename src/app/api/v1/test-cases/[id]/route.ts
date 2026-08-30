import { putTestCaseBodySchema, testCaseIdParamSchema } from "@/lib/contracts";
import { apiHandler } from "@/lib/api/handler";
import { requireActor } from "@/lib/api/history";
import { json } from "@/lib/api/http";
import {
  getTestCaseById,
  softDeleteTestCase,
  updateTestCase,
} from "@/lib/api/test-cases";

export const GET = apiHandler(
  { params: testCaseIdParamSchema },
  async ({ params }) => json(await getTestCaseById(params.id)),
);

export const PUT = apiHandler(
  { params: testCaseIdParamSchema, body: putTestCaseBodySchema },
  async ({ params, body, user }) =>
    json(await updateTestCase(params.id, body, requireActor(user))),
  { auth: "cases.write" },
);

export const DELETE = apiHandler(
  { params: testCaseIdParamSchema },
  async ({ params, user }) =>
    json(await softDeleteTestCase(params.id, requireActor(user))),
  { auth: "cases.write" },
);
