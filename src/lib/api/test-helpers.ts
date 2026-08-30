import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import { POST as LOGIN } from "@/app/api/v1/auth/login/route";
import {
  SESSION_COOKIE_NAME,
  sessionUserResponseSchema,
  type User,
} from "@/lib/contracts";
import { db, users } from "@/lib/db";

import type { AppRouteContext } from "./handler";
import { hashPassword } from "./password";

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

const TEST_ADMIN_EMAIL = "it-admin@opentcm.local";
const TEST_ADMIN_PASSWORD = "it-admin-password";

let defaultTestCookie: string | undefined;

export function setDefaultTestCookie(cookie: string | undefined): void {
  defaultTestCookie = cookie;
}

function formatCookieHeader(cookie: string): string {
  return cookie.includes("=") ? cookie : `${SESSION_COOKIE_NAME}=${cookie}`;
}

/**
 * Invoke a Next.js App Router route handler with a constructed Request.
 * Used by integration tests against the live database.
 *
 * When `authenticateAsTestAdmin()` has run in this file, protected routes
 * receive that Admin cookie unless `unauthenticated: true` or an explicit
 * `cookie` is passed.
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
    /** Do not attach the default Admin session cookie. */
    unauthenticated?: boolean;
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

  if (!headers.has("cookie")) {
    const cookie = options.unauthenticated
      ? undefined
      : (options.cookie ?? defaultTestCookie);
    if (cookie) {
      headers.set("cookie", formatCookieHeader(cookie));
    }
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

/**
 * Ensure a stable Admin exists, log in, and attach the cookie to subsequent
 * `invoke` calls in this test file.
 */
export async function authenticateAsTestAdmin(): Promise<{
  cookie: string;
  user: User;
}> {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, TEST_ADMIN_EMAIL))
    .limit(1);

  if (!existing) {
    await db.insert(users).values({
      email: TEST_ADMIN_EMAIL,
      displayName: "Integration Admin",
      passwordHash: await hashPassword(TEST_ADMIN_PASSWORD),
      role: "admin",
    });
  } else if (existing.role !== "admin" || existing.deactivatedAt) {
    await db
      .update(users)
      .set({
        role: "admin",
        deactivatedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));
  }

  const result = await invoke(LOGIN, {
    method: "POST",
    path: "/api/v1/auth/login",
    body: { email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD },
    unauthenticated: true,
  });
  if (result.status !== 200) {
    throw new Error(`test admin login failed: ${result.status} ${result.text}`);
  }

  const token = sessionTokenFromResponse(result.headers);
  if (!token) {
    throw new Error("test admin login did not Set-Cookie");
  }

  setDefaultTestCookie(token);
  return {
    cookie: token,
    user: sessionUserResponseSchema.parse(result.json).user,
  };
}

export async function loginAs(
  email: string,
  password: string,
): Promise<{ cookie: string; user: User }> {
  const result = await invoke(LOGIN, {
    method: "POST",
    path: "/api/v1/auth/login",
    body: { email, password },
    unauthenticated: true,
  });
  if (result.status !== 200) {
    throw new Error(`loginAs failed: ${result.status} ${result.text}`);
  }
  const token = sessionTokenFromResponse(result.headers);
  if (!token) {
    throw new Error("loginAs did not Set-Cookie");
  }
  return {
    cookie: token,
    user: sessionUserResponseSchema.parse(result.json).user,
  };
}

export { TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD };
