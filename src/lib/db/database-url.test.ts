import { describe, expect, it } from "vitest";

import {
  DATABASE_CONFIG_ERROR,
  requireDatabaseUrl,
  resolveDatabaseUrl,
} from "./database-url";

describe("resolveDatabaseUrl", () => {
  it("prefers DATABASE_URL when set", () => {
    expect(
      resolveDatabaseUrl({
        DATABASE_URL: "  postgresql://a:b@db:5432/app  ",
        POSTGRES_HOST: "ignored",
        POSTGRES_USER: "ignored",
        POSTGRES_DB: "ignored",
      }),
    ).toBe("postgresql://a:b@db:5432/app");
  });

  it("builds a URL from discrete connectors", () => {
    expect(
      resolveDatabaseUrl({
        POSTGRES_HOST: "db.internal",
        POSTGRES_PORT: "6543",
        POSTGRES_USER: "opentcm",
        POSTGRES_PASSWORD: "s3cret",
        POSTGRES_DB: "opentcm",
      }),
    ).toBe("postgresql://opentcm:s3cret@db.internal:6543/opentcm");
  });

  it("encodes reserved characters in user and password", () => {
    expect(
      resolveDatabaseUrl({
        POSTGRES_HOST: "db.internal",
        POSTGRES_USER: "op@en",
        POSTGRES_PASSWORD: "p@ss:w/rd",
        POSTGRES_DB: "opentcm",
      }),
    ).toBe("postgresql://op%40en:p%40ss%3Aw%2Frd@db.internal:5432/opentcm");
  });

  it("wraps IPv6 hosts and appends sslmode", () => {
    expect(
      resolveDatabaseUrl({
        POSTGRES_HOST: "2001:db8::1",
        POSTGRES_USER: "opentcm",
        POSTGRES_PASSWORD: "x",
        POSTGRES_DB: "opentcm",
        POSTGRES_SSLMODE: "require",
      }),
    ).toBe("postgresql://opentcm:x@[2001:db8::1]:5432/opentcm?sslmode=require");
  });

  it("allows an empty password", () => {
    expect(
      resolveDatabaseUrl({
        POSTGRES_HOST: "localhost",
        POSTGRES_USER: "opentcm",
        POSTGRES_PASSWORD: "",
        POSTGRES_DB: "opentcm",
      }),
    ).toBe("postgresql://opentcm:@localhost:5432/opentcm");
  });

  it("returns null when connectors are incomplete", () => {
    expect(resolveDatabaseUrl({})).toBeNull();
    expect(
      resolveDatabaseUrl({
        POSTGRES_HOST: "localhost",
        POSTGRES_USER: "opentcm",
      }),
    ).toBeNull();
  });
});

describe("requireDatabaseUrl", () => {
  it("throws a configuration error when nothing is set", () => {
    expect(() => requireDatabaseUrl({})).toThrow(DATABASE_CONFIG_ERROR);
  });
});
