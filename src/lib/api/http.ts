export function json(
  data: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  return Response.json(data, { status, headers });
}

export function created(data: unknown, location: string): Response {
  return Response.json(data, {
    status: 201,
    headers: { Location: location },
  });
}

export function noContent(headers?: HeadersInit): Response {
  return new Response(null, { status: 204, headers });
}
