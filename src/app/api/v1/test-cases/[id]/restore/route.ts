import { testCaseIdParamSchema } from "@/lib/contracts";
import { apiHandler } from "@/lib/api/handler";
import { json } from "@/lib/api/http";
import { restoreTestCase } from "@/lib/api/trash";

export const POST = apiHandler(
  { params: testCaseIdParamSchema },
  async ({ params }) => json(await restoreTestCase(params.id)),
);
