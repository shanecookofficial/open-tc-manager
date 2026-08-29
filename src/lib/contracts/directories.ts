import { z } from "zod";

import {
  idParamSchema,
  idSchema,
  nameSchema,
  timestampsSchema,
} from "./shared";

export const directorySchema = timestampsSchema.extend({
  id: idSchema,
  projectId: idSchema,
  parentId: idSchema.nullable(),
  name: nameSchema,
});

export type Directory = z.infer<typeof directorySchema>;

export const directoryPathSegmentSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
});

export type DirectoryPathSegment = z.infer<typeof directoryPathSegmentSchema>;

export const createDirectoryBodySchema = z.strictObject({
  projectId: idSchema,
  name: nameSchema,
  parentId: idSchema.nullable().optional(),
});

export type CreateDirectoryBody = z.infer<typeof createDirectoryBodySchema>;

export const patchDirectoryBodySchema = z
  .strictObject({
    name: nameSchema.optional(),
    parentId: idSchema.nullable().optional(),
  })
  .refine((body) => body.name !== undefined || body.parentId !== undefined, {
    message: "At least one of name or parentId is required",
  });

export type PatchDirectoryBody = z.infer<typeof patchDirectoryBodySchema>;

export const directoryDeleteModeSchema = z.enum([
  "trash_contents",
  "move_contents_to_parent",
]);

export type DirectoryDeleteMode = z.infer<typeof directoryDeleteModeSchema>;

export const directoryDeleteQuerySchema = z.object({
  mode: directoryDeleteModeSchema.optional(),
});

export const directoryDeleteResponseSchema = z.object({
  id: idSchema,
  deleted: z.literal(true),
  mode: directoryDeleteModeSchema.nullable(),
  trashedCaseCount: z.number().int().min(0),
  movedCaseCount: z.number().int().min(0),
  movedDirectoryCount: z.number().int().min(0),
});

export type DirectoryDeleteResponse = z.infer<
  typeof directoryDeleteResponseSchema
>;

export type TreeNode = {
  id: number;
  name: string;
  parentId: number | null;
  activeCaseCount: number;
  children: TreeNode[];
};

export const treeNodeSchema: z.ZodType<TreeNode> = z.lazy(() =>
  z.object({
    id: idSchema,
    name: z.string().min(1),
    parentId: idSchema.nullable(),
    activeCaseCount: z.number().int().min(0),
    children: z.array(treeNodeSchema),
  }),
);

export const projectTreeSchema = z.object({
  projectId: idSchema,
  name: z.string().min(1),
  prefix: z.string().min(1),
  activeCaseCount: z.number().int().min(0),
  rootCaseCount: z.number().int().min(0),
  trashCount: z.number().int().min(0),
  directories: z.array(treeNodeSchema),
});

export type ProjectTree = z.infer<typeof projectTreeSchema>;

export const directoryIdParamSchema = z.object({
  id: idParamSchema,
});
