import { z } from "zod";

import {
  idParamSchema,
  idSchema,
  nameSchema,
  timestampsSchema,
  userRoleSchema,
} from "./shared";

export const PERMISSIONS = [
  "cases.write",
  "cases.revert",
  "directories.write",
  "cases.bulk",
  "trash.purge",
  "projects.write",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const permissionSchema = z.enum(PERMISSIONS);

export const MEMBER_PERMISSIONS: Permission[] = [
  "cases.write",
  "cases.revert",
  "directories.write",
  "cases.bulk",
];

export const VIEWER_PERMISSIONS: Permission[] = [];

export const ADMIN_PERMISSIONS: Permission[] = [...PERMISSIONS];

export const roleSchema = timestampsSchema.extend({
  id: idSchema,
  slug: userRoleSchema,
  name: nameSchema,
  description: z.string().trim().max(200).nullable(),
  builtIn: z.boolean(),
  locked: z.boolean(),
  permissions: z.array(permissionSchema),
});

export type Role = z.infer<typeof roleSchema>;

export const roleListResponseSchema = z.object({
  items: z.array(roleSchema),
});

export type RoleListResponse = z.infer<typeof roleListResponseSchema>;

export const createRoleBodySchema = z.strictObject({
  name: nameSchema,
  description: z.string().trim().max(200).nullable().optional(),
  permissions: z.array(permissionSchema),
});

export type CreateRoleBody = z.infer<typeof createRoleBodySchema>;

export const patchRoleBodySchema = z
  .strictObject({
    name: nameSchema.optional(),
    description: z.string().trim().max(200).nullable().optional(),
    permissions: z.array(permissionSchema).optional(),
  })
  .refine(
    (body) =>
      body.name !== undefined ||
      body.description !== undefined ||
      body.permissions !== undefined,
    { message: "At least one field is required" },
  );

export type PatchRoleBody = z.infer<typeof patchRoleBodySchema>;

export const roleIdParamSchema = z.object({
  id: idParamSchema,
});
