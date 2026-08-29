import { z } from "zod";

import { emailSchema, passwordSchema } from "./shared";

export const loginBodySchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
});

export type LoginBody = z.infer<typeof loginBodySchema>;

export const changePasswordBodySchema = z.strictObject({
  currentPassword: passwordSchema,
  newPassword: passwordSchema,
});

export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;

/** Cookie name for the opaque session token (httpOnly). */
export const SESSION_COOKIE_NAME = "opentcm_session";

/** Sliding session lifetime in seconds (7 days). */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
