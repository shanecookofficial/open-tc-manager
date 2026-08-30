import { loginBodySchema } from "@/lib/contracts";
import { login } from "@/lib/api/auth";
import { apiHandler } from "@/lib/api/handler";
import { json } from "@/lib/api/http";

export const POST = apiHandler(
  { body: loginBodySchema },
  async ({ body }) => {
    const { user, cookie } = await login(body);
    return json({ user }, 200, { "Set-Cookie": cookie });
  },
  { auth: "public" },
);
