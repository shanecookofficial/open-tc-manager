"use client";

import { useState } from "react";

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

  const matches =
    requiredText === "DELETE"
      ? value.trim().toUpperCase() === "DELETE"
      : value.trim() === requiredText;

  const handleOpenChange = (next: boolean) => {
    if (!next) setValue("");
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <Label htmlFor="typed-confirm">
            Type <span className="font-mono font-semibold">{requiredText}</span> to
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
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!matches || isSubmitting}
            onClick={() => void onConfirm()}
          >
            {isSubmitting ? "Deleting…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
