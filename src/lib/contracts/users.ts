import { z } from "zod";

import { permissionSchema } from "./roles";
import {
  displayNameSchema,
  emailSchema,
  idParamSchema,
  idSchema,
  isoDateTimeSchema,
  passwordSchema,
  timestampsSchema,
  userRoleSchema,
} from "./shared";

export const userSchema = timestampsSchema.extend({
  id: idSchema,
  email: emailSchema,
  displayName: displayNameSchema,
  role: userRoleSchema,
  roleName: z.string().min(1).optional(),
  permissions: z.array(permissionSchema).optional(),
  deactivatedAt: isoDateTimeSchema.nullable(),
});

export type User = z.infer<typeof userSchema>;

export const userListResponseSchema = z.object({
  items: z.array(userSchema),
});

export type UserListResponse = z.infer<typeof userListResponseSchema>;

export const sessionUserResponseSchema = z.object({
  user: userSchema,
});

export type SessionUserResponse = z.infer<typeof sessionUserResponseSchema>;

export const createUserBodySchema = z.strictObject({
  email: emailSchema,
  displayName: displayNameSchema,
  role: userRoleSchema,
  password: passwordSchema,
});

export type CreateUserBody = z.infer<typeof createUserBodySchema>;

export const patchUserBodySchema = z
  .strictObject({
    displayName: displayNameSchema.optional(),
    role: userRoleSchema.optional(),
    deactivatedAt: isoDateTimeSchema.nullable().optional(),
    password: passwordSchema.optional(),
  })
  .refine(
    (body) =>
      body.displayName !== undefined ||
      body.role !== undefined ||
      body.deactivatedAt !== undefined ||
      body.password !== undefined,
    { message: "At least one field is required" },
  );

export type PatchUserBody = z.infer<typeof patchUserBodySchema>;

export const userIdParamSchema = z.object({
  id: idParamSchema,
});
