import { createHash, randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  type User,
} from "@/lib/contracts";
import { db, sessions, users } from "@/lib/db";

import { ApiError } from "./errors";
import { serializeUser } from "./serialize";

export type AuthSession = {
  sessionId: number;
  token: string;
  user: User;
};

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function formatSessionCookie(token: string, maxAge: number): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (process.env.HTTPS === "true") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function clearSessionCookie(): string {
  return formatSessionCookie("", 0);
}

export function readSessionToken(request: Request): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) {
    return undefined;
  }

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    if (name !== SESSION_COOKIE_NAME) {
      continue;
    }
    const value = part.slice(separator + 1).trim();
    if (value.length === 0) {
      return undefined;
    }
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return undefined;
}

export async function createSession(
  userId: number,
): Promise<{ token: string; sessionId: number }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  const [row] = await db
    .insert(sessions)
    .values({
      userId,
      tokenHash: hashToken(token),
      expiresAt,
    })
    .returning({ id: sessions.id });
  if (!row) {
    throw new Error("Failed to create session");
  }

  return { token, sessionId: row.id };
}

export async function destroySession(sessionId: number): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function touchSession(sessionId: number): Promise<void> {
  await db
    .update(sessions)
    .set({
      expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
    })
    .where(eq(sessions.id, sessionId));
}

function unauthenticated(): never {
  throw new ApiError("UNAUTHENTICATED", "Sign in to continue.");
}

/**
 * Resolve a valid, non-expired session from the opaque cookie token.
 * Expired or deactivated sessions are deleted. Returns null when unauthenticated.
 */
export async function resolveSessionFromToken(
  token: string | undefined,
): Promise<AuthSession | null> {
  if (!token) {
    return null;
  }

  const tokenHash = hashToken(token);
  const [row] = await db
    .select({
      session: sessions,
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  if (!row) {
    return null;
  }

  if (row.session.expiresAt.getTime() <= Date.now()) {
    await destroySession(row.session.id);
    return null;
  }

  if (row.user.deactivatedAt) {
    await destroySession(row.session.id);
    return null;
  }

  return {
    sessionId: row.session.id,
    token,
    user: serializeUser(row.user),
  };
}

/**
 * Resolve a valid, non-expired session for the request cookie.
 * Deactivated users are treated as logged out (session row deleted, 401).
 */
export async function requireSession(request: Request): Promise<AuthSession> {
  const session = await resolveSessionFromToken(readSessionToken(request));
  if (!session) {
    unauthenticated();
  }
  return session;
}

export function sessionCookieHeader(token: string): string {
  return formatSessionCookie(token, SESSION_MAX_AGE_SECONDS);
}
