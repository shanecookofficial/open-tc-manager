import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  database: z.literal("connected"),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
