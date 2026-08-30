import type { Directory, ProjectTree, TreeNode } from "./directories";
import type { CaseEventSnapshot, TestCaseEvent } from "./events";
import type { Project } from "./projects";
import type { TestCase, TestCaseSummary } from "./test-cases";
import type { User } from "./users";

const CREATED = "2026-08-01T09:00:00.000Z";
const UPDATED = "2026-08-20T16:45:00.000Z";
const RECENT = "2026-08-28T12:00:00.000Z";
const TRASHED_AT = "2026-08-27T18:30:00.000Z";
const DEACTIVATED_AT = "2026-08-26T10:00:00.000Z";
const EVENT_B_AT = "2026-08-28T13:00:00.000Z";
const EVENT_C_AT = "2026-08-28T15:00:00.000Z";
const EVENT_D_AT = "2026-08-29T09:00:00.000Z";

export type ContractFixtures = {
  projects: Project[];
  directories: Directory[];
  testCases: TestCase[];
  trees: Record<number, ProjectTree>;
  users: User[];
  /** WEB-1 timeline whose snapshots are A, B, C, A (revert of C to A). */
  caseEvents: TestCaseEvent[];
};

function displayNumber(prefix: string, caseNumber: number): string {
  return `${prefix}-${caseNumber}`;
}

function directoryPath(
  directories: Directory[],
  directoryId: number | null,
): { id: number; name: string }[] {
  const byId = new Map(
    directories.map((directory) => [directory.id, directory]),
  );
  const path: Directory[] = [];
  let current = directoryId === null ? undefined : byId.get(directoryId);
  while (current) {
    path.unshift(current);
    current =
      current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return path.map((directory) => ({ id: directory.id, name: directory.name }));
}

function buildTree(
  project: Project,
  directories: Directory[],
  testCases: TestCase[],
): ProjectTree {
  const projectDirs = directories.filter((d) => d.projectId === project.id);
  const projectCases = testCases.filter((c) => c.projectId === project.id);
  const active = projectCases.filter((c) => c.deletedAt === null);
  const trashed = projectCases.filter((c) => c.deletedAt !== null);

  const childrenOf = (parentId: number | null): TreeNode[] =>
    projectDirs
      .filter((d) => d.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((d) => ({
        id: d.id,
        name: d.name,
        parentId: d.parentId,
        activeCaseCount: active.filter((c) => c.directoryId === d.id).length,
        children: childrenOf(d.id),
      }));

  return {
    projectId: project.id,
    name: project.name,
    prefix: project.prefix,
    activeCaseCount: active.length,
    rootCaseCount: active.filter((c) => c.directoryId === null).length,
    trashCount: trashed.length,
    directories: childrenOf(null),
  };
}

function snapshotOf(testCase: TestCase): CaseEventSnapshot {
  return {
    title: testCase.title,
    description: testCase.description,
    directoryId: testCase.directoryId,
    steps: testCase.steps.map((item) => ({
      action: item.action,
      expectedResult: item.expectedResult,
    })),
    deletedAt: testCase.deletedAt,
  };
}

function step(
  id: number,
  position: number,
  action: string,
  expectedResult: string | null = null,
) {
  return { id, position, action, expectedResult };
}

function regressionSteps() {
  const rows: { action: string; expectedResult: string | null }[] = [
    {
      action: "Open `/checkout` with an empty cart.",
      expectedResult:
        "Empty-cart illustration and a **Continue shopping** link.",
    },
    {
      action: "Add `SKU-RED-M` (Red hoodie, size M) from the catalog.",
      expectedResult: "Cart badge shows `1`.",
    },
    {
      action: "Add `SKU-NAVY-L` (Navy hoodie, size L).",
      expectedResult: "Cart badge shows `2`. Subtotal is `$128.00`.",
    },
    {
      action: "Change the navy hoodie quantity to `2`.",
      expectedResult: "Subtotal updates to `$192.00`.",
    },
    {
      action: "Remove the red hoodie.",
      expectedResult: "Only the navy hoodie remains. Quantity still `2`.",
    },
    {
      action: "Open the cart drawer, then click **Checkout**.",
      expectedResult: "Step 1 of 4: contact information.",
    },
    {
      action: "Enter email `shopper@example.test` and continue.",
      expectedResult: null,
    },
    {
      action:
        "Fill shipping address:\n\n- Name: `Ada Lovelace`\n- Street: `12 Analytical Engine Rd`\n- City: `London`\n- Postal code: `EC2A 4NE`",
      expectedResult: "No inline validation errors.",
    },
    {
      action: "Choose **Express** shipping (`$12.00`).",
      expectedResult: "Order summary lists Express and total `$204.00`.",
    },
    {
      action:
        "Go back to the cart from the stepper and change quantity to `1`.",
      expectedResult:
        "Returning to checkout restores the address; total is `$108.00`.",
    },
    {
      action: "Apply promo code `SAVE10`.",
      expectedResult:
        "Discount line `−$9.60`. Total `$98.40` plus shipping `$12.00` = `$110.40`.",
    },
    {
      action: "Apply promo code `SAVE10` a second time.",
      expectedResult: "Error toast: `Code already applied.` Totals unchanged.",
    },
    {
      action: "Select payment method **Visa**.",
      expectedResult: null,
    },
    {
      action: "Enter card `4242 4242 4242 4242`, expiry `12/28`, CVC `123`.",
      expectedResult: "Card brand icon switches to Visa.",
    },
    {
      action: "Submit the order.",
      expectedResult: "3-D Secure modal appears within 2 seconds.",
    },
    {
      action: "Complete 3-D Secure with challenge password `password`.",
      expectedResult:
        "Confirmation page `/orders/thank-you` with order number `WEB-ORD-1001`.",
    },
    {
      action: "Open the confirmation email in the mailhog fixture inbox.",
      expectedResult:
        "Subject `Your OpenTCM shop order WEB-ORD-1001`. PDF receipt attached.",
    },
    {
      action: "Click **View order** in the email.",
      expectedResult:
        "Signed-in order history shows the navy hoodie, qty 1, paid `$110.40`.",
    },
    {
      action: "From order history, click **Refund** and confirm.",
      expectedResult: "Status becomes `Refund pending`.",
    },
    {
      action:
        "Wait for the refund webhook (fixture: click **Simulate refund settled**).",
      expectedResult:
        "Status becomes `Refunded`. Email `Refund for WEB-ORD-1001` arrives.",
    },
    {
      action:
        "Repeat the happy path with **ACH** instead of Visa, using routing `110000000` and account `000123456789`.",
      expectedResult:
        "No 3-D Secure. Confirmation shows `Payment method: ACH` and a 5-day settlement note.",
    },
    {
      action:
        "Open `/checkout` in a second browser with the same cart cookie and submit concurrently.",
      expectedResult:
        "One request succeeds; the other shows `Cart already checked out` and does **not** double-charge.",
    },
  ];

  return rows.map((row, index) =>
    step(1100 + index + 1, index + 1, row.action, row.expectedResult),
  );
}

/**
 * Representative contract fixtures for UI development. IDs are stable so
 * Playwright and Storybook can hard-code `WEB-11`, directory `3`, etc.
 *
 * Coverage:
 * - two projects (`WEB`, `API`)
 * - four directories, one nested twice (`Auth / Login / MFA`)
 * - markdown tables, code fences, and lists
 * - steps without expected results
 * - a 22-step case
 * - a zero-step draft
 * - three trashed cases
 * - three roles plus a deactivated Member
 * - a four-event WEB-1 timeline whose snapshots are A, B, C, A
 */
export function createFixtures(): ContractFixtures {
  const projects: Project[] = [
    {
      id: 1,
      name: "Web App",
      prefix: "WEB",
      nextCaseNumber: 16,
      createdAt: CREATED,
      updatedAt: RECENT,
    },
    {
      id: 2,
      name: "Payments API",
      prefix: "API",
      nextCaseNumber: 4,
      createdAt: CREATED,
      updatedAt: UPDATED,
    },
  ];

  const directories: Directory[] = [
    {
      id: 1,
      projectId: 1,
      parentId: null,
      name: "Authentication",
      createdAt: CREATED,
      updatedAt: CREATED,
    },
    {
      id: 2,
      projectId: 1,
      parentId: 1,
      name: "Login",
      createdAt: CREATED,
      updatedAt: CREATED,
    },
    {
      id: 3,
      projectId: 1,
      parentId: 2,
      name: "MFA",
      createdAt: CREATED,
      updatedAt: UPDATED,
    },
    {
      id: 4,
      projectId: 1,
      parentId: null,
      name: "Checkout",
      createdAt: CREATED,
      updatedAt: UPDATED,
    },
  ];

  const web = projects[0];
  const api = projects[1];

  const assemble = (
    partial: Omit<TestCase, "displayNumber" | "directoryPath">,
  ): TestCase => ({
    ...partial,
    displayNumber: displayNumber(
      partial.projectId === web.id ? web.prefix : api.prefix,
      partial.caseNumber,
    ),
    directoryPath: directoryPath(directories, partial.directoryId),
  });

  const testCases: TestCase[] = [
    assemble({
      id: 1,
      projectId: 1,
      directoryId: 2,
      caseNumber: 1,
      title: "Login with valid credentials",
      description:
        "Happy-path login for a verified shopper.\n\nChecklist before you start:\n\n- Use the seeded user `ada@example.test` / `correct-horse`\n- Browser: latest Chrome or Firefox\n- Feature flag `auth.v2` **on**",
      steps: [
        step(
          101,
          1,
          "Open `/login`.",
          "The email and password fields are empty. The **Sign in** button is disabled.",
        ),
        step(
          102,
          2,
          "Type `ada@example.test` into **Email** and `correct-horse` into **Password**.",
          "**Sign in** becomes enabled.",
        ),
        step(
          103,
          3,
          "Press **Enter** (do not click the button).",
          "Redirect to `/dashboard`. Header shows `Ada Lovelace`.",
        ),
      ],
      deletedAt: null,
      createdAt: CREATED,
      updatedAt: UPDATED,
    }),
    assemble({
      id: 2,
      projectId: 1,
      directoryId: 2,
      caseNumber: 2,
      title: "Login rejects an incorrect password",
      description: null,
      steps: [
        step(201, 1, "Open `/login`."),
        step(
          202,
          2,
          "Submit email `ada@example.test` and password `wrong-horse`.",
          "Inline error `Email or password is incorrect.` Password field is cleared. No session cookie is set.",
        ),
        step(
          203,
          3,
          "Submit the same wrong password five more times.",
          "Account lock banner: `Too many attempts. Try again in 15 minutes.`",
        ),
      ],
      deletedAt: null,
      createdAt: CREATED,
      updatedAt: UPDATED,
    }),
    assemble({
      id: 3,
      projectId: 1,
      directoryId: 3,
      caseNumber: 3,
      title: "TOTP challenge after password",
      description:
        "MFA is required for users in the `finance` group.\n\nSeeded authenticator secret (base32):\n\n```\nJBSWY3DPEHPK3PXP\n```\n\nUse a TOTP generator set to 30-second SHA-1 windows.",
      steps: [
        step(
          301,
          1,
          "Sign in as `ada@example.test` (finance group) with the correct password.",
          "MFA page `/login/mfa` asks for a 6-digit code. Password is not shown again.",
        ),
        step(
          302,
          2,
          "Enter a code that is **one window old**.",
          "Error `Invalid code.` Remaining attempts shown.",
        ),
        step(
          303,
          3,
          "Enter the current TOTP for `JBSWY3DPEHPK3PXP`.",
          "Redirect to `/dashboard`.",
        ),
      ],
      deletedAt: null,
      createdAt: CREATED,
      updatedAt: RECENT,
    }),
    assemble({
      id: 4,
      projectId: 1,
      directoryId: 1,
      caseNumber: 4,
      title: "SSO via SAML (Okta fixture)",
      description:
        'IdP metadata is served from the local fixture at `http://localhost:8080/okta/metadata`.\n\nExample `AuthnRequest` (for log comparison only — do not paste into production):\n\n```xml\n<samlp:AuthnRequest\n  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"\n  ID="_abc123"\n  Version="2.0"\n  IssueInstant="2026-08-28T12:00:00Z"\n  AssertionConsumerServiceURL="https://app.example.test/sso/acs">\n  <saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">\n    https://app.example.test/sso/metadata\n  </saml:Issuer>\n</samlp:AuthnRequest>\n```',
      steps: [
        step(
          401,
          1,
          "From `/login`, click **Continue with Okta**.",
          "Browser redirects to the fixture IdP. `SAMLRequest` is a POST binding.",
        ),
        step(
          402,
          2,
          "Authenticate on the IdP as `ada@example.test` and allow the release of `email` + `name`.",
          "ACS consumes the assertion. New session. Landing page `/dashboard`.",
        ),
      ],
      deletedAt: null,
      createdAt: CREATED,
      updatedAt: UPDATED,
    }),
    assemble({
      id: 5,
      projectId: 1,
      directoryId: 4,
      caseNumber: 5,
      title: "Checkout payment method matrix",
      description:
        "Expected behaviour by method:\n\n| Method | 3-D Secure | Settlement | Refunds |\n| --- | --- | --- | --- |\n| Visa credit | Required over $50 | Instant | Instant |\n| Visa debit | Required over $50 | Instant | 1–2 days |\n| ACH | Never | 5 business days | 5 business days |\n| Gift card | Never | Instant | Store credit |\n\nAmounts are **USD**. Tax is 0% in the fixture region `XX`.",
      steps: [
        step(
          501,
          1,
          "Add any in-stock SKU and open `/checkout` with subtotal `$64.00`.",
          "Payment method radios: Visa, ACH, Gift card. None selected.",
        ),
        step(
          502,
          2,
          "Select **Gift card** and enter code `GIFT-50` (balance `$50.00`).",
          "Remaining balance `$14.00` must still be paid by Visa or ACH.",
        ),
      ],
      deletedAt: null,
      createdAt: CREATED,
      updatedAt: RECENT,
    }),
    assemble({
      id: 6,
      projectId: 1,
      directoryId: 4,
      caseNumber: 6,
      title: "Apply and remove a discount code",
      description: "Promo `SAVE10` is 10% off subtotal, not shipping.",
      steps: [
        step(
          601,
          1,
          "On checkout with subtotal `$80.00`, enter `save10` (lowercase).",
          null,
        ),
        step(
          602,
          2,
          "Blur the field or press **Apply**.",
          "Code is normalised to `SAVE10`. Discount `−$8.00`.",
        ),
        step(
          603,
          3,
          "Click **Remove** next to the code.",
          "Discount line disappears. Subtotal back to `$80.00`.",
        ),
      ],
      deletedAt: null,
      createdAt: CREATED,
      updatedAt: UPDATED,
    }),
    assemble({
      id: 7,
      projectId: 1,
      directoryId: 4,
      caseNumber: 7,
      title: "Expired card is declined without creating an order",
      description: null,
      steps: [
        step(
          701,
          1,
          "Pay with Visa `4000 0000 0000 0069` (fixture: expired).",
          "Inline error on the expiry field: `Card expired.` No `/orders/thank-you` navigation. Cart intact.",
        ),
      ],
      deletedAt: null,
      createdAt: CREATED,
      updatedAt: UPDATED,
    }),
    assemble({
      id: 8,
      projectId: 1,
      directoryId: 4,
      caseNumber: 8,
      title: "Keyboard-only checkout",
      description:
        "No pointing device. Use Tab / Shift+Tab / Enter / Space only.\n\nThis case is the a11y canary for the checkout flow.",
      steps: [
        step(
          801,
          1,
          "Tab from the address fields through shipping options to **Continue to payment** and activate it with Enter.",
          "Focus moves to the first payment radio. A visible focus ring is present.",
        ),
        step(
          802,
          2,
          "Complete payment fields and submit with Enter.",
          "Confirmation heading `Thanks for your order` is focused (or the page sets focus to it).",
        ),
      ],
      deletedAt: null,
      createdAt: CREATED,
      updatedAt: UPDATED,
    }),
    assemble({
      id: 9,
      projectId: 1,
      directoryId: 4,
      caseNumber: 9,
      title: "Empty cart cannot start checkout",
      description: "Direct navigation to `/checkout` with no cart cookie.",
      steps: [
        step(
          901,
          1,
          "In a fresh session, open `/checkout`.",
          "Redirect to `/cart` with message `Your cart is empty.`",
        ),
      ],
      deletedAt: null,
      createdAt: CREATED,
      updatedAt: CREATED,
    }),
    assemble({
      id: 10,
      projectId: 1,
      directoryId: 1,
      caseNumber: 10,
      title: "Session expires mid-checkout",
      description: null,
      steps: [
        step(
          1001,
          1,
          "Reach the payment step while signed in. Wait for the 30-minute idle timeout (or call the fixture `POST /debug/expire-session`).",
          "A modal `Your session expired` with **Sign in** is shown. Cart is preserved in `localStorage`.",
        ),
        step(
          1002,
          2,
          "Sign in again.",
          "Return to `/checkout` payment step with the same cart and address.",
        ),
      ],
      deletedAt: null,
      createdAt: CREATED,
      updatedAt: UPDATED,
    }),
    assemble({
      id: 11,
      projectId: 1,
      directoryId: 4,
      caseNumber: 11,
      title: "Checkout full regression (22 steps)",
      description:
        "End-to-end regression used in the weekly release train. Expect this case to take ~25 minutes.\n\n```bash\n# Optional: reset the shop fixtures first\ncurl -X POST http://localhost:4010/fixtures/shop/reset\n```\n\nDo **not** skip 3-D Secure even if a previous run already enrolled the card.",
      steps: regressionSteps(),
      deletedAt: null,
      createdAt: CREATED,
      updatedAt: RECENT,
    }),
    assemble({
      id: 12,
      projectId: 1,
      directoryId: null,
      caseNumber: 12,
      title: "Draft: guest checkout (steps TBD)",
      description:
        "Placeholder while product decides whether guest checkout stays in v1 of the shop. **Zero steps on purpose.**",
      steps: [],
      deletedAt: null,
      createdAt: RECENT,
      updatedAt: RECENT,
    }),
    assemble({
      id: 13,
      projectId: 1,
      directoryId: 2,
      caseNumber: 13,
      title: "Internet Explorer 11 login (retired)",
      description:
        "IE11 is no longer supported. Kept in trash for history until purge.",
      steps: [
        step(
          1301,
          1,
          "Open `/login` in IE11.",
          "Unsupported-browser banner. Form is not shown.",
        ),
      ],
      deletedAt: TRASHED_AT,
      createdAt: CREATED,
      updatedAt: TRASHED_AT,
    }),
    assemble({
      id: 14,
      projectId: 1,
      directoryId: 4,
      caseNumber: 14,
      title: "Flash checkout widget (retired)",
      description: "Flash is gone. Trashed pending permanent delete.",
      steps: [step(1401, 1, "Load the Flash checkout SWF.", null)],
      deletedAt: TRASHED_AT,
      createdAt: CREATED,
      updatedAt: TRASHED_AT,
    }),
    assemble({
      id: 15,
      projectId: 1,
      directoryId: null,
      caseNumber: 15,
      title: "Legacy gift-wrap SKU (directory deleted)",
      description:
        "Originally lived in a `Gift wrap` folder that no longer exists. `directoryId` is `null`, so restore will land at the project root.",
      steps: [
        step(
          1501,
          1,
          "Add gift-wrap SKU `WRAP-01` from the product page.",
          "Cart shows a gift-wrap line item with no shipping weight.",
        ),
      ],
      deletedAt: TRASHED_AT,
      createdAt: CREATED,
      updatedAt: TRASHED_AT,
    }),
    assemble({
      id: 16,
      projectId: 2,
      directoryId: null,
      caseNumber: 1,
      title: "GET /v1/health returns 200",
      description:
        'Smoke check for the Payments API.\n\n```http\nGET /v1/health HTTP/1.1\nHost: api.example.test\n```\n\n```json\n{ "status": "ok" }\n```',
      steps: [
        step(
          1601,
          1,
          "Call `GET /v1/health` with no auth header.",
          'HTTP 200. Body `{ "status": "ok" }`. `X-Request-Id` is present.',
        ),
      ],
      deletedAt: null,
      createdAt: CREATED,
      updatedAt: UPDATED,
    }),
    assemble({
      id: 17,
      projectId: 2,
      directoryId: null,
      caseNumber: 2,
      title: "POST /v1/charges creates a charge",
      description:
        "Idempotency-Key is required.\n\n| Field | Rule |\n| --- | --- |\n| `amount` | Integer cents, `>= 50` |\n| `currency` | `usd` only in v1 |\n| `source` | Token `tok_visa` in fixtures |",
      steps: [
        step(
          1701,
          1,
          "POST `/v1/charges` with `Idempotency-Key: 11111111-1111-1111-1111-111111111111`, amount `5000`, currency `usd`, source `tok_visa`.",
          "HTTP 201. `status` is `succeeded`. `amount` is `5000`.",
        ),
        step(
          1702,
          2,
          "Repeat the exact same request (same idempotency key).",
          "HTTP 200 with the **same** charge id. No second capture.",
        ),
      ],
      deletedAt: null,
      createdAt: CREATED,
      updatedAt: RECENT,
    }),
    assemble({
      id: 18,
      projectId: 2,
      directoryId: null,
      caseNumber: 3,
      title: "Webhook signature verification",
      description: null,
      steps: [
        step(
          1801,
          1,
          'POST `/v1/webhooks` with a valid `Stripe-Signature` for payload `{ "type": "charge.succeeded" }`.',
          'HTTP 200 `{ "received": true }`. Event stored once.',
        ),
        step(
          1802,
          2,
          "Replay with a tampered payload and the original signature.",
          null,
        ),
      ],
      deletedAt: null,
      createdAt: CREATED,
      updatedAt: UPDATED,
    }),
  ];

  const users: User[] = [
    {
      id: 1,
      email: "ada@opentcm.local",
      displayName: "Ada Lovelace",
      role: "admin",
      deactivatedAt: null,
      createdAt: CREATED,
      updatedAt: RECENT,
    },
    {
      id: 2,
      email: "charles@opentcm.local",
      displayName: "Charles Babbage",
      role: "member",
      deactivatedAt: null,
      createdAt: CREATED,
      updatedAt: UPDATED,
    },
    {
      id: 3,
      email: "grace@opentcm.local",
      displayName: "Grace Hopper",
      role: "viewer",
      deactivatedAt: null,
      createdAt: CREATED,
      updatedAt: CREATED,
    },
    {
      id: 4,
      email: "retired@opentcm.local",
      displayName: "Retired Member",
      role: "member",
      deactivatedAt: DEACTIVATED_AT,
      createdAt: CREATED,
      updatedAt: DEACTIVATED_AT,
    },
  ];

  const ada = users[0];
  const charles = users[1];
  const web1 = testCases[0];
  const snapshotA = snapshotOf(web1);
  const snapshotB: CaseEventSnapshot = {
    ...snapshotA,
    title: "Login with valid credentials — shopper",
  };
  const snapshotC: CaseEventSnapshot = {
    ...snapshotB,
    description:
      "Second edit: shopper login after the title change. Revert target is still the original created snapshot.",
  };
  const snapshotD: CaseEventSnapshot = structuredClone(snapshotA);

  // Chronological story A→B→C→A (not GET list order; GET is newest-first).
  const caseEvents: TestCaseEvent[] = [
    {
      id: 1,
      testCaseId: web1.id,
      actorId: ada.id,
      actorEmail: ada.email,
      actorDisplayName: ada.displayName,
      action: "created",
      revertedEventId: null,
      snapshot: snapshotA,
      createdAt: CREATED,
    },
    {
      id: 2,
      testCaseId: web1.id,
      actorId: charles.id,
      actorEmail: charles.email,
      actorDisplayName: charles.displayName,
      action: "updated",
      revertedEventId: null,
      snapshot: snapshotB,
      createdAt: EVENT_B_AT,
    },
    {
      id: 3,
      testCaseId: web1.id,
      actorId: charles.id,
      actorEmail: charles.email,
      actorDisplayName: charles.displayName,
      action: "updated",
      revertedEventId: null,
      snapshot: snapshotC,
      createdAt: EVENT_C_AT,
    },
    {
      id: 4,
      testCaseId: web1.id,
      actorId: ada.id,
      actorEmail: ada.email,
      actorDisplayName: ada.displayName,
      action: "reverted",
      revertedEventId: 1,
      snapshot: snapshotD,
      createdAt: EVENT_D_AT,
    },
  ];

  return {
    projects,
    directories,
    testCases,
    trees: {
      [web.id]: buildTree(web, directories, testCases),
      [api.id]: buildTree(api, directories, testCases),
    },
    users,
    caseEvents,
  };
}

export function toSummary(testCase: TestCase): TestCaseSummary {
  return {
    id: testCase.id,
    projectId: testCase.projectId,
    directoryId: testCase.directoryId,
    caseNumber: testCase.caseNumber,
    displayNumber: testCase.displayNumber,
    title: testCase.title,
    stepCount: testCase.steps.length,
    deletedAt: testCase.deletedAt,
    createdAt: testCase.createdAt,
    updatedAt: testCase.updatedAt,
  };
}

export function getCaseByDisplayNumber(
  fixtures: ContractFixtures,
  displayNumberValue: string,
): TestCase | undefined {
  return fixtures.testCases.find((c) => c.displayNumber === displayNumberValue);
}
