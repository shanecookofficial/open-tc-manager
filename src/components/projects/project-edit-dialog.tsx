"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ApiClientError,
  parseValidationFieldPath,
  updateProject,
} from "@/lib/api-client";
import { patchProjectBodySchema } from "@/lib/contracts";
import type { Project } from "@/lib/contracts";

type ProjectEditFormProps = {
  project: Project;
  onUpdated: (project: Project) => void;
  onClose: () => void;
};

function ProjectEditForm({
  project,
  onUpdated,
  onClose,
}: ProjectEditFormProps) {
  const [name, setName] = useState(project.name);
  const [prefix, setPrefix] = useState(project.prefix);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const prefixChanged = prefix !== project.prefix;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFieldErrors({});

    const parsed = patchProjectBodySchema.safeParse({ name, prefix });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0];
        if (typeof path === "string") {
          errors[path] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await updateProject(project.id, parsed.data);
      toast.success(`Project "${updated.name}" updated`);
      onUpdated(updated);
      onClose();
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.code === "VALIDATION_ERROR") {
          const { fieldPath, detail } = parseValidationFieldPath(error.message);
          if (fieldPath) {
            setFieldErrors({ [fieldPath]: detail });
          } else {
            toast.error(detail);
          }
          return;
        }
        toast.error(error.message);
        return;
      }
      toast.error("Failed to update project");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Edit project</DialogTitle>
        <DialogDescription>
          Update the project name or case-number prefix.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="edit-project-name">Name</Label>
          <Input
            id="edit-project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={fieldErrors.name ? true : undefined}
          />
          {fieldErrors.name ? (
            <p className="text-sm text-destructive">{fieldErrors.name}</p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="edit-project-prefix">Prefix</Label>
          <Input
            id="edit-project-prefix"
            value={prefix}
            onChange={(event) => setPrefix(event.target.value.toUpperCase())}
            className="font-mono uppercase"
            aria-invalid={fieldErrors.prefix ? true : undefined}
          />
          {fieldErrors.prefix ? (
            <p className="text-sm text-destructive">{fieldErrors.prefix}</p>
          ) : null}
          {prefixChanged ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Existing case IDs will display with the new prefix.
            </p>
          ) : null}
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}

type ProjectEditDialogProps = {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (project: Project) => void;
};

export function ProjectEditDialog({
  project,
  open,
  onOpenChange,
  onUpdated,
}: ProjectEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {project ? (
          <ProjectEditForm
            key={project.id}
            project={project}
            onUpdated={onUpdated}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
