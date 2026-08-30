import { createDirectoryBodySchema } from "@/lib/contracts";
import { apiHandler } from "@/lib/api/handler";
import { created } from "@/lib/api/http";
import { createDirectory } from "@/lib/api/directories";

export const POST = apiHandler(
  { body: createDirectoryBodySchema },
  async ({ body }) => {
    const directory = await createDirectory(body);
    return created(directory, `/api/v1/directories/${directory.id}`);
  },
  { auth: "directories.write" },
);
