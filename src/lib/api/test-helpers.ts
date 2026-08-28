import { randomBytes } from "node:crypto";

import type { AppRouteContext } from "./handler";

type RouteHandler = (
  request: Request,
  context?: AppRouteContext,
) => Promise<Response>;

export type ApiResult<T = unknown> = {
  status: number;
  json: T;
  headers: Headers;
  text: string;
};

/**
 * Invoke a Next.js App Router route handler with a constructed Request.
 * Used by integration tests against the live database.
 */
export async function invoke<T = unknown>(
  handler: RouteHandler,
  options: {
    method?: string;
    path: string;
    body?: unknown;
    params?: Record<string, string>;
  },
): Promise<ApiResult<T>> {
  const init: RequestInit = { method: options.method ?? "GET" };
  if (options.body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(options.body);
  }

  const request = new Request(`http://localhost${options.path}`, init);
  const response = await handler(request, {
    params: Promise.resolve(options.params ?? {}),
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = text;
    }
  }

  return {
    status: response.status,
    json: parsed as T,
    headers: response.headers,
    text,
  };
}

/** Prefix matching `^[A-Z][A-Z0-9]{1,9}$`, unique across parallel-ish test runs. */
export function uniquePrefix(letter = "Z"): string {
  return `${letter}${randomBytes(4).toString("hex").toUpperCase()}`.slice(
    0,
    10,
  );
}

export function uniqueName(label = "Project"): string {
  return `${label} ${uniquePrefix("N")}-${Date.now().toString(36)}`;
}
