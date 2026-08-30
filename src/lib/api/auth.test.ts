import { afterEach, describe, expect, it } from "vitest";

import {
  DEV_BOOTSTRAP_ADMIN_EMAIL,
  DEV_BOOTSTRAP_ADMIN_PASSWORD,
  resolveBootstrapCredentials,
} from "@/lib/auth/bootstrap-credentials";
import { hashPassword, verifyPassword } from "./password";
import { formatSessionCookie } from "./session";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/contracts";

describe("resolveBootstrapCredentials", () => {
  it("uses explicit env when both values are set", () => {
    expect(
      resolveBootstrapCredentials({
        NODE_ENV: "production",
        BOOTSTRAP_ADMIN_EMAIL: "ada@example.com",
        BOOTSTRAP_ADMIN_PASSWORD: "change-me-in-production",
      }),
    ).toEqual({
      email: "ada@example.com",
      password: "change-me-in-production",
    });
  });

  it("does not fill a partial env pair", () => {
    expect(
      resolveBootstrapCredentials({
        NODE_ENV: "development",
        BOOTSTRAP_ADMIN_EMAIL: "ada@example.com",
      }),
    ).toBeNull();
    expect(
      resolveBootstrapCredentials({
        NODE_ENV: "development",
        BOOTSTRAP_ADMIN_PASSWORD: "change-me-in-production",
      }),
    ).toBeNull();
  });

  it("uses the development default when env is unset", () => {
    expect(resolveBootstrapCredentials({ NODE_ENV: "development" })).toEqual({
      email: DEV_BOOTSTRAP_ADMIN_EMAIL,
      password: DEV_BOOTSTRAP_ADMIN_PASSWORD,
    });
  });

  it("does not invent an Admin in production or test", () => {
    expect(resolveBootstrapCredentials({ NODE_ENV: "production" })).toBeNull();
    expect(resolveBootstrapCredentials({ NODE_ENV: "test" })).toBeNull();
    expect(resolveBootstrapCredentials({})).toBeNull();
  });
});

describe("Argon2id password hashing", () => {
  it("verifies a hash of the same password and rejects a different one", async () => {
    const hash = await hashPassword("correct-horse");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, "correct-horse")).toBe(true);
    expect(await verifyPassword(hash, "wrong-password")).toBe(false);
  });
});

describe("session cookie flags", () => {
  const original = process.env.HTTPS;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.HTTPS;
    } else {
      process.env.HTTPS = original;
    }
  });

  it("sets HttpOnly, SameSite=Lax, Path=/, and 7-day Max-Age without Secure by default", () => {
    delete process.env.HTTPS;
    const cookie = formatSessionCookie("token-value", SESSION_MAX_AGE_SECONDS);
    expect(cookie).toBe(
      `${SESSION_COOKIE_NAME}=token-value; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    );
  });

  it("adds Secure when HTTPS=true", () => {
    process.env.HTTPS = "true";
    const cookie = formatSessionCookie("token-value", SESSION_MAX_AGE_SECONDS);
    expect(cookie).toContain("Secure");
  });
});
