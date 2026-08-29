"use client";

import { useState, type FormEvent } from "react";

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

type TypedConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  requiredText: string;
  onConfirm: () => void | Promise<void>;
  isSubmitting?: boolean;
};

export function TypedConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  requiredText,
  onConfirm,
  isSubmitting = false,
}: TypedConfirmDialogProps) {
  const [value, setValue] = useState("");

  const trimmed = value.trim();
  const typedDelete = trimmed.toUpperCase() === "DELETE";
  // PLAN §7 / M3-7: permanent delete accepts the stated token or the word DELETE.
  const matches =
    typedDelete || (requiredText !== "" && trimmed === requiredText);

  const handleOpenChange = (next: boolean) => {
    if (!next) setValue("");
    onOpenChange(next);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!matches || isSubmitting) return;
    void onConfirm();
  };

  const tokenHint =
    requiredText && requiredText !== "DELETE"
      ? `${requiredText} or DELETE`
      : requiredText || "DELETE";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="typed-confirm">
              Type <span className="font-mono font-semibold">{tokenHint}</span> to
              confirm
            </Label>
            <Input
              id="typed-confirm"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!matches || isSubmitting}
            >
              {isSubmitting ? "Deleting…" : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
