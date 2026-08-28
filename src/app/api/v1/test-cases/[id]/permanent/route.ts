import { testCaseIdParamSchema } from "@/lib/contracts";
import { apiHandler } from "@/lib/api/handler";
import { noContent } from "@/lib/api/http";
import { permanentlyDeleteTestCase } from "@/lib/api/trash";

export const DELETE = apiHandler(
  { params: testCaseIdParamSchema },
  async ({ params }) => {
    await permanentlyDeleteTestCase(params.id);
    return noContent();
  },
);
