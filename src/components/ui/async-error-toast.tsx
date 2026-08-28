"use client";

import { useEffect } from "react";
import { toast } from "sonner";

type AsyncErrorToastProps = {
  error: Error | undefined;
  message?: string;
  onRetry?: () => void;
};

export function useAsyncErrorToast({
  error,
  message = "Failed to load data",
  onRetry,
}: AsyncErrorToastProps) {
  useEffect(() => {
    if (!error) return;
    toast.error(message, {
      action: onRetry
        ? {
            label: "Retry",
            onClick: onRetry,
          }
        : undefined,
    });
  }, [error, message, onRetry]);
}
