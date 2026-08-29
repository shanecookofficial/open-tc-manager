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
  createProject,
  parseValidationFieldPath,
} from "@/lib/api-client";
import { createProjectBodySchema } from "@/lib/contracts";
import type { Project } from "@/lib/contracts";

type ProjectCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (project: Project) => void;
};

export function ProjectCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: ProjectCreateDialogProps) {
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = () => {
    setName("");
    setPrefix("");
    setFieldErrors({});
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFieldErrors({});

    const parsed = createProjectBodySchema.safeParse({ name, prefix });
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
      const project = await createProject(parsed.data);
      toast.success(`Project "${project.name}" created`);
      onCreated(project);
      reset();
      onOpenChange(false);
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
      toast.error("Failed to create project");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
            <DialogDescription>
              Each project has a unique case-number prefix (e.g. WEB, API).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Web application"
                aria-invalid={fieldErrors.name ? true : undefined}
              />
              {fieldErrors.name ? (
                <p className="text-sm text-destructive">{fieldErrors.name}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project-prefix">Prefix</Label>
              <Input
                id="project-prefix"
                value={prefix}
                onChange={(event) =>
                  setPrefix(event.target.value.toUpperCase())
                }
                placeholder="WEB"
                className="font-mono uppercase"
                aria-invalid={fieldErrors.prefix ? true : undefined}
              />
              {fieldErrors.prefix ? (
                <p className="text-sm text-destructive">{fieldErrors.prefix}</p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
