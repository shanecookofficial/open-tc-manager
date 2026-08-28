"use client";

import { useId, useState } from "react";

import { cn } from "@/lib/utils";

import { Markdown } from "./markdown";

type MarkdownEditorProps = {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  error?: string;
  disabled?: boolean;
  className?: string;
};

export function MarkdownEditor({
  id: idProp,
  label,
  value,
  onChange,
  placeholder,
  rows = 6,
  error,
  disabled = false,
  className,
}: MarkdownEditorProps) {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const errorId = `${id}-error`;
  const [tab, setTab] = useState<"write" | "preview">("write");

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <label id={`${id}-label`} htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <div
          role="tablist"
          aria-label={`${label} mode`}
          className="inline-flex rounded-md border bg-muted p-0.5"
        >
          <button
            type="button"
            role="tab"
            id={`${id}-write-tab`}
            aria-selected={tab === "write"}
            aria-controls={`${id}-write-panel`}
            className={cn(
              "rounded-sm px-2.5 py-1 text-xs font-medium transition-colors",
              tab === "write"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setTab("write")}
          >
            Write
          </button>
          <button
            type="button"
            role="tab"
            id={`${id}-preview-tab`}
            aria-selected={tab === "preview"}
            aria-controls={`${id}-preview-panel`}
            className={cn(
              "rounded-sm px-2.5 py-1 text-xs font-medium transition-colors",
              tab === "preview"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setTab("preview")}
          >
            Preview
          </button>
        </div>
      </div>

      {tab === "write" ? (
        <textarea
          id={id}
          aria-labelledby={`${id}-label`}
          rows={rows}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            "flex w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-destructive ring-destructive/20",
          )}
        />
      ) : (
        <div
          id={`${id}-preview-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-preview-tab`}
          className="min-h-[calc(var(--rows,6)*1.5rem+1rem)] rounded-md border border-input bg-background px-3 py-2"
          style={{ "--rows": rows } as React.CSSProperties}
        >
          {value.trim() ? (
            <Markdown>{value}</Markdown>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
          )}
        </div>
      )}

      {error ? (
        <p id={errorId} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
