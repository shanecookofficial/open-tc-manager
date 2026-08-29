import {
  createTestCaseBodySchema,
  testCaseListQuerySchema,
} from "@/lib/contracts";
import { apiHandler } from "@/lib/api/handler";
import { requireActor } from "@/lib/api/history";
import { created, json } from "@/lib/api/http";
import { createTestCase, listActiveTestCases } from "@/lib/api/test-cases";

export const GET = apiHandler(
  { query: testCaseListQuerySchema },
  async ({ query }) => json(await listActiveTestCases(query)),
);

export const POST = apiHandler(
  { body: createTestCaseBodySchema },
  async ({ body, user }) => {
    const testCase = await createTestCase(body, requireActor(user));
    return created(testCase, `/api/v1/test-cases/${testCase.id}`);
  },
  { auth: "member" },
);
