import { z } from "zod";

import {
  idParamSchema,
  idSchema,
  nameSchema,
  prefixSchema,
  timestampsSchema,
} from "./shared";

export const projectSchema = timestampsSchema.extend({
  id: idSchema,
  name: nameSchema,
  prefix: prefixSchema,
  nextCaseNumber: z.number().int().positive(),
});

export type Project = z.infer<typeof projectSchema>;

export const projectListResponseSchema = z.object({
  items: z.array(projectSchema),
});

export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;

export const createProjectBodySchema = z.strictObject({
  name: nameSchema,
  prefix: prefixSchema,
});

export type CreateProjectBody = z.infer<typeof createProjectBodySchema>;

export const patchProjectBodySchema = z
  .strictObject({
    name: nameSchema.optional(),
    prefix: prefixSchema.optional(),
  })
  .refine((body) => body.name !== undefined || body.prefix !== undefined, {
    message: "At least one of name or prefix is required",
  });

export type PatchProjectBody = z.infer<typeof patchProjectBodySchema>;

export const projectIdParamSchema = z.object({
  id: idParamSchema,
});
