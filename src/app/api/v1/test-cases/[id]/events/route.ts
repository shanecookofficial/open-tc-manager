import {
  testCaseEventsParamsSchema,
  testCaseEventsQuerySchema,
} from "@/lib/contracts";
import { listCaseEvents } from "@/lib/api/events";
import { apiHandler } from "@/lib/api/handler";
import { json } from "@/lib/api/http";

export const GET = apiHandler(
  {
    params: testCaseEventsParamsSchema,
    query: testCaseEventsQuerySchema,
  },
  async ({ params, query }) => json(await listCaseEvents(params.id, query)),
);
