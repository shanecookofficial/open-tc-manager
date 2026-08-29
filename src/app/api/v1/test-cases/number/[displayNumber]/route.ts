import { testCaseDisplayNumberParamSchema } from "@/lib/contracts";
import { apiHandler } from "@/lib/api/handler";
import { json } from "@/lib/api/http";
import { getTestCaseByDisplayNumber } from "@/lib/api/test-cases";

export const GET = apiHandler(
  { params: testCaseDisplayNumberParamSchema },
  async ({ params }) =>
    json(await getTestCaseByDisplayNumber(params.displayNumber)),
);
