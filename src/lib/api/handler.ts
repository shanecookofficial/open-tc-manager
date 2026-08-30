import { z } from "zod";

import type { User } from "@/lib/contracts";
import { ApiError, formatZodError, toErrorResponse } from "./errors";
import { assertRole, type AuthLevel } from "./roles";
import {
  requireSession,
  sessionCookieHeader,
  touchSession,
  type AuthSession,
} from "./session";

export type RouteParams = Record<string, string>;

/** Next.js App Router context (params is a Promise in Next 15+). */
export type AppRouteContext = {
  params?: Promise<RouteParams>;
};

type Schemas<TParams, TQuery, TBody> = {
  params?: z.ZodType<TParams>;
  query?: z.ZodType<TQuery>;
  body?: z.ZodType<TBody>;
  /** Empty body is treated as `{}` and then parsed with `body`. */
  bodyOptional?: boolean;
};

export type HandlerOptions = {
  /**
   * Default `"authenticated"` — every `/api/v1` route except login and health.
   * Session is resolved before params/query/body so anonymous callers get 401
   * first (API.md §1.10–§1.11).
   */
  auth?: AuthLevel;
  /** Refresh session expiry and re-send the cookie. Default true when authed. */
  sliding?: boolean;
};

function isSetupExemptPath(request: Request): boolean {
  const path = new URL(request.url).pathname;
  return (
    path === "/api/v1/auth/me" ||
    path === "/api/v1/auth/logout" ||
    path === "/api/v1/auth/setup-admin"
  );
}

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
  optional: boolean,
): Promise<T> {
  const text = await request.text();
  if (text.trim() === "") {
    if (optional) {
      return parseSchema(schema, {});
    }
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

function withSetCookie(response: Response, cookie: string): Response {
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", cookie);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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
    session: AuthSession | null;
    user: User | null;
  }) => Response | Promise<Response>,
  options: HandlerOptions = {},
): (request: Request, context?: AppRouteContext) => Promise<Response> {
  const auth: AuthLevel = options.auth ?? "authenticated";
  const sliding = options.sliding ?? auth !== "public";

  return async (request, context) => {
    try {
      let session: AuthSession | null = null;
      if (auth !== "public") {
        session = await requireSession(request);
        if (
          session.user.mustSetupAccount &&
          !isSetupExemptPath(request)
        ) {
          throw new ApiError(
            "SETUP_REQUIRED",
            "Create your admin account to continue.",
          );
        }
        assertRole(session.user, auth);
      }

      const rawParams = context?.params ? await context.params : {};
      const params = schemas.params
        ? parseSchema(schemas.params, rawParams)
        : (undefined as TParams);
      const query = schemas.query
        ? parseSchema(schemas.query, queryRecord(request))
        : (undefined as TQuery);
      const body = schemas.body
        ? await parseBody(request, schemas.body, schemas.bodyOptional === true)
        : (undefined as TBody);

      const response = await handler({
        request,
        params,
        query,
        body,
        session,
        user: session?.user ?? null,
      });

      if (session && sliding && !response.headers.has("Set-Cookie")) {
        await touchSession(session.sessionId);
        return withSetCookie(response, sessionCookieHeader(session.token));
      }

      return response;
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
