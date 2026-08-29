import { errorBody } from "@/lib/api/errors";

/**
 * Unknown paths under `/api/v1` — JSON 404 envelope instead of Next's HTML page.
 * More-specific route files take precedence over this catch-all.
 */
function notFound(request: Request): Response {
  const path = new URL(request.url).pathname;
  return Response.json(
    errorBody("NOT_FOUND", `No API endpoint matches ${path}.`),
    { status: 404 },
  );
}

export async function GET(request: Request) {
  return notFound(request);
}

export async function POST(request: Request) {
  return notFound(request);
}

export async function PUT(request: Request) {
  return notFound(request);
}

export async function PATCH(request: Request) {
  return notFound(request);
}

export async function DELETE(request: Request) {
  return notFound(request);
}
