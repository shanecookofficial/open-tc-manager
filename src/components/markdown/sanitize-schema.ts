import { defaultSchema, type Schema } from "hast-util-sanitize";

/**
 * Strict allowlist for user-authored markdown. No raw HTML pass-through;
 * GFM elements (tables, task lists, code) are permitted.
 */
export const markdownSanitizeSchema: Schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), "className"],
    span: [...(defaultSchema.attributes?.span ?? []), "className"],
    a: [...(defaultSchema.attributes?.a ?? []), "target", "rel"],
    th: [...(defaultSchema.attributes?.th ?? []), "align"],
    td: [...(defaultSchema.attributes?.td ?? []), "align"],
    input: ["type", "checked", "disabled"],
  },
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "del",
    "input",
  ],
};
