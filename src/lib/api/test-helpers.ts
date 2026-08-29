import { randomBytes } from "node:crypto";

import { SESSION_COOKIE_NAME } from "@/lib/contracts";

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
    rawBody?: string;
    headers?: HeadersInit;
    params?: Record<string, string>;
    /** Opaque session token or a full `Cookie` header value. */
    cookie?: string;
  },
): Promise<ApiResult<T>> {
  const init: RequestInit = { method: options.method ?? "GET" };
  const headers = new Headers(options.headers);

  if (options.rawBody !== undefined) {
    init.body = options.rawBody;
  } else if (options.body !== undefined) {
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    init.body = JSON.stringify(options.body);
  }

  if (!headers.has("cookie") && options.cookie) {
    const cookie = options.cookie.includes("=")
      ? options.cookie
      : `${SESSION_COOKIE_NAME}=${options.cookie}`;
    headers.set("cookie", cookie);
  }

  if ([...headers.keys()].length > 0) {
    init.headers = headers;
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

export function uniqueEmail(label = "user"): string {
  return `${label}.${randomBytes(4).toString("hex")}@opentcm.test`;
}

/** Read the opaque `opentcm_session` token from a response Set-Cookie header. */
export function sessionTokenFromResponse(headers: Headers): string | undefined {
  const lines =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [headers.get("set-cookie") ?? ""];
  for (const line of lines) {
    const match = line.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]*)`));
    if (match && match[1].length > 0) {
      return match[1];
    }
  }
  return undefined;
}

export function cookieCleared(headers: Headers): boolean {
  const lines =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [headers.get("set-cookie") ?? ""];
  return lines.some((line) =>
    new RegExp(`${SESSION_COOKIE_NAME}=(?:;|$)|Max-Age=0`).test(line),
  );
}
