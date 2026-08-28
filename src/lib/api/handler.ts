import { z } from "zod";

import { ApiError, formatZodError, toErrorResponse } from "./errors";

export type RouteParams = Record<string, string>;

/** Next.js App Router context (params is a Promise in Next 15+). */
export type AppRouteContext = {
  params?: Promise<RouteParams>;
};

type Schemas<TParams, TQuery, TBody> = {
  params?: z.ZodType<TParams>;
  query?: z.ZodType<TQuery>;
  body?: z.ZodType<TBody>;
};

function parseSchema<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiError("VALIDATION_ERROR", formatZodError(result.error));
  }
  return result.data;
}

/**
 * Query-string record. Empty `q` is dropped so it is ignored per API.md §1.5
 * rather than failing the `min(1)` search schema.
 */
export function queryRecord(request: Request): Record<string, string> {
  const url = new URL(request.url);
  const record: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    record[key] = value;
  }
  if (record.q !== undefined && record.q.trim() === "") {
    delete record.q;
  }
  return record;
}

async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  const text = await request.text();
  if (text.trim() === "") {
    throw new ApiError("VALIDATION_ERROR", "Request body is required");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Invalid JSON body");
  }
  return parseSchema(schema, raw);
}

/**
 * Zod request validation → typed handler → contract error envelope.
 * Thrown `ApiError`s map to `{ error: { code, message } }` with the right status.
 */
export function apiHandler<
  TParams = undefined,
  TQuery = undefined,
  TBody = undefined,
>(
  schemas: Schemas<TParams, TQuery, TBody>,
  handler: (ctx: {
    request: Request;
    params: TParams;
    query: TQuery;
    body: TBody;
  }) => Response | Promise<Response>,
): (request: Request, context?: AppRouteContext) => Promise<Response> {
  return async (request, context) => {
    try {
      const rawParams = context?.params ? await context.params : {};
      const params = schemas.params
        ? parseSchema(schemas.params, rawParams)
        : (undefined as TParams);
      const query = schemas.query
        ? parseSchema(schemas.query, queryRecord(request))
        : (undefined as TQuery);
      const body = schemas.body
        ? await parseBody(request, schemas.body)
        : (undefined as TBody);

      return await handler({ request, params, query, body });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
