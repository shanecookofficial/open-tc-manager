import {
  revertTestCaseBodySchema,
  testCaseEventsParamsSchema,
} from "@/lib/contracts";
import { revertTestCase } from "@/lib/api/events";
import { apiHandler } from "@/lib/api/handler";
import { requireActor } from "@/lib/api/history";
import { created } from "@/lib/api/http";

export const POST = apiHandler(
  { params: testCaseEventsParamsSchema, body: revertTestCaseBodySchema },
  async ({ params, body, user }) => {
    const result = await revertTestCase(
      params.id,
      body.eventId,
      requireActor(user),
    );
    return created(result, `/api/v1/test-cases/${params.id}`);
  },
  { auth: "member" },
);
