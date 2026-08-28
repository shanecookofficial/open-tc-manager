"use client";

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  GripVerticalIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import {
  DirectoryTree,
  directorySelectionToApiFilter,
  type DirectorySelection,
} from "@/components/repository/directory-tree";
import { MarkdownEditor } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAsyncData } from "@/hooks/use-async-data";
import {
  ApiClientError,
  createTestCase,
  getProjectTree,
  parseValidationFieldPath,
  updateTestCase,
} from "@/lib/api-client";
import {
  createTestCaseBodySchema,
  putTestCaseBodySchema,
  type Project,
  type TestCase,
} from "@/lib/contracts";

type StepRowState = {
  key: string;
  action: string;
  expectedResult: string;
};

function newStepRow(): StepRowState {
  return {
    key: crypto.randomUUID(),
    action: "",
    expectedResult: "",
  };
}

function stepsFromTestCase(testCase: TestCase): StepRowState[] {
  if (testCase.steps.length === 0) {
    return [newStepRow()];
  }
  return testCase.steps.map((step) => ({
    key: crypto.randomUUID(),
    action: step.action,
    expectedResult: step.expectedResult ?? "",
  }));
}

const editorStepSchema = z.object({
  action: z.string().trim().min(1, "Action is required"),
  expectedResult: z.string().optional(),
});

const editorFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().optional(),
  steps: z.array(editorStepSchema).min(1, "Add at least one step"),
});

type CaseEditorFormProps = {
  mode: "create" | "edit";
  project: Project;
  initialDirectoryId?: number | null;
  testCase?: TestCase;
};

function SortableStepRow({
  row,
  index,
  total,
  fieldErrors,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  row: StepRowState;
  index: number;
  total: number;
  fieldErrors: Record<string, string>;
  onChange: (key: string, patch: Partial<StepRowState>) => void;
  onRemove: (key: string) => void;
  onMoveUp: (key: string) => void;
  onMoveDown: (key: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const actionError = fieldErrors[`steps.${index}.action`];
  const expectedError = fieldErrors[`steps.${index}.expectedResult`];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border bg-card p-4 ${isDragging ? "opacity-60 shadow-md" : ""}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="cursor-grab rounded p-1 text-muted-foreground hover:bg-accent active:cursor-grabbing"
            aria-label={`Drag step ${index + 1}`}
            {...attributes}
            {...listeners}
          >
            <GripVerticalIcon className="size-4" />
          </button>
          <span className="text-sm font-medium">Step {index + 1}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Move step ${index + 1} up`}
            disabled={index === 0}
            onClick={() => onMoveUp(row.key)}
          >
            <ArrowUpIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Move step ${index + 1} down`}
            disabled={index === total - 1}
            onClick={() => onMoveDown(row.key)}
          >
            <ArrowDownIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove step ${index + 1}`}
            disabled={total <= 1}
            onClick={() => onRemove(row.key)}
          >
            <Trash2Icon />
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <MarkdownEditor
          label="Action"
          value={row.action}
          onChange={(value) => onChange(row.key, { action: value })}
          rows={3}
          error={actionError}
        />
        <MarkdownEditor
          label="Expected result (optional)"
          value={row.expectedResult}
          onChange={(value) => onChange(row.key, { expectedResult: value })}
          rows={2}
          error={expectedError}
        />
      </div>
    </div>
  );
}

export function CaseEditorForm({
  mode,
  project,
  initialDirectoryId = null,
  testCase,
}: CaseEditorFormProps) {
  const router = useRouter();
  const formId = useId();
  const [title, setTitle] = useState(testCase?.title ?? "");
  const [description, setDescription] = useState(testCase?.description ?? "");
  const [directorySelection, setDirectorySelection] = useState<DirectorySelection>(
    testCase
      ? testCase.directoryId === null
        ? { type: "root" }
        : { type: "directory", id: testCase.directoryId }
      : initialDirectoryId === null || initialDirectoryId === undefined
        ? { type: "root" }
        : { type: "directory", id: initialDirectoryId },
  );
  const [steps, setSteps] = useState<StepRowState[]>(() =>
    testCase ? stepsFromTestCase(testCase) : [newStepRow()],
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: tree } = useAsyncData(
    () => getProjectTree(project.id),
    [project.id],
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const updateStep = (key: string, patch: Partial<StepRowState>) => {
    setSteps((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  };

  const insertStepAfter = (index: number) => {
    setSteps((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, newStepRow());
      return next;
    });
  };

  const removeStep = (key: string) => {
    setSteps((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  };

  const moveStep = (key: string, direction: -1 | 1) => {
    setSteps((prev) => {
      const index = prev.findIndex((row) => row.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      return arrayMove(prev, index, target);
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSteps((prev) => {
      const oldIndex = prev.findIndex((row) => row.key === active.id);
      const newIndex = prev.findIndex((row) => row.key === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const applyServerError = (message: string) => {
    const { fieldPath, detail } = parseValidationFieldPath(message);
    if (fieldPath) {
      setFieldErrors({ [fieldPath]: detail });
    } else {
      toast.error(detail);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFieldErrors({});

    const parsed = editorFormSchema.safeParse({
      title,
      description,
      steps: steps.map((row) => ({
        action: row.action,
        expectedResult: row.expectedResult,
      })),
    });

    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        errors[path] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    const directoryId = directorySelectionToApiFilter(directorySelection) ?? null;
    const stepPayload = parsed.data.steps.map((row) => ({
      action: row.action,
      expectedResult: row.expectedResult?.trim()
        ? row.expectedResult.trim()
        : null,
    }));

    const descriptionValue = description.trim() ? description.trim() : null;

    setIsSubmitting(true);
    try {
      if (mode === "create") {
        const body = createTestCaseBodySchema.parse({
          projectId: project.id,
          title: parsed.data.title,
          description: descriptionValue,
          directoryId,
          steps: stepPayload,
        });
        const created = await createTestCase(body);
        toast.success(`Created ${created.displayNumber}`);
        router.push(`/cases/${created.displayNumber}`);
        return;
      }

      if (!testCase) return;

      const body = putTestCaseBodySchema.parse({
        title: parsed.data.title,
        description: descriptionValue,
        directoryId,
        steps: stepPayload,
      });
      const updated = await updateTestCase(testCase.id, body);
      toast.success(`Saved ${updated.displayNumber}`);
      router.push(`/cases/${updated.displayNumber}`);
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "VALIDATION_ERROR") {
        applyServerError(error.message);
        return;
      }
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        for (const issue of error.issues) {
          errors[issue.path.join(".")] = issue.message;
        }
        setFieldErrors(errors);
        return;
      }
      if (error instanceof ApiClientError) {
        toast.error(error.message);
        return;
      }
      toast.error("Failed to save test case");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      id={formId}
      onSubmit={handleSubmit}
      className="mx-auto max-w-4xl space-y-6 p-6"
      noValidate
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {mode === "create" ? "New test case" : `Edit ${testCase?.displayNumber}`}
        </h1>
        <p className="text-sm text-muted-foreground">Project: {project.name}</p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${formId}-title`}>Title</Label>
        <Input
          id={`${formId}-title`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-invalid={fieldErrors.title ? true : undefined}
        />
        {fieldErrors.title ? (
          <p className="text-sm text-destructive">{fieldErrors.title}</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label>Directory</Label>
        {tree ? (
          <div className="max-h-48 overflow-y-auto rounded-md border p-2">
            <DirectoryTree
              directories={tree.directories}
              allCount={tree.activeCaseCount}
              selection={directorySelection}
              onSelect={setDirectorySelection}
              placementMode
            />
          </div>
        ) : (
          <div className="h-24 animate-pulse rounded-md bg-accent" />
        )}
      </div>

      <MarkdownEditor
        label="Description (optional)"
        value={description}
        onChange={setDescription}
        rows={5}
        error={fieldErrors.description}
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Steps</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSteps((prev) => [...prev, newStepRow()])}
          >
            <PlusIcon />
            Add step
          </Button>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={steps.map((row) => row.key)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {steps.map((row, index) => (
                <div key={row.key} className="space-y-2">
                  <SortableStepRow
                    row={row}
                    index={index}
                    total={steps.length}
                    fieldErrors={fieldErrors}
                    onChange={updateStep}
                    onRemove={removeStep}
                    onMoveUp={(key) => moveStep(key, -1)}
                    onMoveDown={(key) => moveStep(key, 1)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => insertStepAfter(index)}
                  >
                    <PlusIcon />
                    Insert step below
                  </Button>
                </div>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Saving…"
            : mode === "create"
              ? "Create test case"
              : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
