import { errorBody, toErrorResponse } from "@/lib/api/errors";
import {
  requireSession,
  sessionCookieHeader,
  touchSession,
} from "@/lib/api/session";

/**
 * Unknown paths under `/api/v1` — JSON 404 envelope instead of Next's HTML page.
 * More-specific route files take precedence over this catch-all.
 * Unauthenticated callers get 401 first (API.md §1.10).
 */
async function guarded(request: Request): Promise<Response> {
  const session = await requireSession(request);
  await touchSession(session.sessionId);
  const path = new URL(request.url).pathname;
  return Response.json(
    errorBody("NOT_FOUND", `No API endpoint matches ${path}.`),
    {
      status: 404,
      headers: { "Set-Cookie": sessionCookieHeader(session.token) },
    },
  );
}

async function handle(request: Request): Promise<Response> {
  try {
    return await guarded(request);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

export async function PUT(request: Request) {
  return handle(request);
}

export async function PATCH(request: Request) {
  return handle(request);
}

export async function DELETE(request: Request) {
  return handle(request);
}
