import { describe, expect, it } from "vitest";

import {
  bulkSelectionSchema,
  bulkSelectionWithProjectSchema,
  createProjectBodySchema,
  createTestCaseBodySchema,
  errorBodySchema,
  healthResponseSchema,
  projectListResponseSchema,
  projectSchema,
  projectTreeSchema,
  testCaseListResponseSchema,
  testCaseSchema,
  testCaseSummarySchema,
} from "./index";
import { createFixtures, toSummary } from "./fixtures";
import { PAGE_SIZE_DEFAULT } from "./shared";

describe("contract fixtures", () => {
  const fixtures = createFixtures();

  it("parses both projects", () => {
    expect(fixtures.projects).toHaveLength(2);
    for (const project of fixtures.projects) {
      expect(projectSchema.parse(project).id).toBe(project.id);
    }
    expect(
      projectListResponseSchema.parse({ items: fixtures.projects }).items,
    ).toHaveLength(2);
  });

  it("parses every test case, including markdown-heavy and trashed ones", () => {
    expect(fixtures.testCases.length).toBeGreaterThanOrEqual(15);
    for (const testCase of fixtures.testCases) {
      expect(testCaseSchema.parse(testCase).displayNumber).toBe(
        testCase.displayNumber,
      );
      expect(testCaseSummarySchema.parse(toSummary(testCase)).stepCount).toBe(
        testCase.steps.length,
      );
    }
  });

  it("includes a 20+ step case, a zero-step draft, and cases without expected results", () => {
    const longCase = fixtures.testCases.find(
      (c) => c.displayNumber === "WEB-11",
    );
    expect(longCase?.steps.length).toBeGreaterThanOrEqual(20);

    const draft = fixtures.testCases.find((c) => c.displayNumber === "WEB-12");
    expect(draft?.steps).toEqual([]);

    const missingExpected = fixtures.testCases
      .flatMap((c) => c.steps)
      .filter((step) => step.expectedResult === null);
    expect(missingExpected.length).toBeGreaterThan(0);
  });

  it("includes three trashed WEB cases and nested Auth/Login/MFA directories", () => {
    const trashed = fixtures.testCases.filter(
      (c) => c.projectId === 1 && c.deletedAt !== null,
    );
    expect(trashed).toHaveLength(3);

    const names = fixtures.directories.map((d) => d.name);
    expect(names).toEqual(
      expect.arrayContaining(["Authentication", "Login", "MFA", "Checkout"]),
    );
    const mfa = fixtures.directories.find((d) => d.name === "MFA");
    const login = fixtures.directories.find((d) => d.name === "Login");
    expect(mfa?.parentId).toBe(login?.id);
    expect(login?.parentId).toBe(1);
  });

  it("parses project trees with consistent counts", () => {
    const webTree = projectTreeSchema.parse(fixtures.trees[1]);
    expect(webTree.activeCaseCount).toBe(
      fixtures.testCases.filter(
        (c) => c.projectId === 1 && c.deletedAt === null,
      ).length,
    );
    expect(webTree.trashCount).toBe(3);
    expect(webTree.directories.some((d) => d.name === "Authentication")).toBe(
      true,
    );
    projectTreeSchema.parse(fixtures.trees[2]);
  });

  it("parses a pagination envelope built from summaries", () => {
    const items = fixtures.testCases
      .filter((c) => c.projectId === 1 && c.deletedAt === null)
      .map(toSummary);
    const parsed = testCaseListResponseSchema.parse({
      page: 1,
      pageSize: PAGE_SIZE_DEFAULT,
      totalItems: items.length,
      totalPages: 1,
      items,
    });
    expect(parsed.items.length).toBe(items.length);
  });

  it("parses the health and error envelopes", () => {
    expect(
      healthResponseSchema.parse({ status: "ok", database: "connected" })
        .status,
    ).toBe("ok");
    expect(
      errorBodySchema.parse({
        error: {
          code: "CASE_NOT_TRASHED",
          message: "Case WEB-1 is not in the trash.",
        },
      }).error.code,
    ).toBe("CASE_NOT_TRASHED");
  });
});

describe("contract negative cases", () => {
  it("rejects a lowercase / too-short prefix", () => {
    expect(() =>
      createProjectBodySchema.parse({ name: "Web", prefix: "web" }),
    ).toThrow();
    expect(() =>
      createProjectBodySchema.parse({ name: "Web", prefix: "W" }),
    ).toThrow();
  });

  it("rejects an empty / whitespace title", () => {
    expect(() =>
      createTestCaseBodySchema.parse({ projectId: 1, title: "" }),
    ).toThrow();
    expect(() =>
      createTestCaseBodySchema.parse({ projectId: 1, title: "   " }),
    ).toThrow();
  });

  it("rejects a bulk envelope that sends ids and all together", () => {
    expect(() =>
      bulkSelectionSchema.parse({ ids: [1, 2], all: true, filter: {} }),
    ).toThrow();
    expect(() =>
      bulkSelectionWithProjectSchema.parse({
        projectId: 1,
        ids: [1],
        all: true,
      }),
    ).toThrow();
  });

  it("rejects an empty ids array", () => {
    expect(() => bulkSelectionSchema.parse({ ids: [] })).toThrow();
  });
});
