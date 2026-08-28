"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiClientError } from "@/lib/api-client";

type UseAsyncState<T> = {
  data: T | undefined;
  error: ApiClientError | Error | undefined;
  isLoading: boolean;
  refetch: () => void;
};

export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[],
): UseAsyncState<T> {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<ApiClientError | Error | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const refetch = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (data === undefined) {
        setIsLoading(true);
      }
      setError(undefined);

      try {
        const result = await fetcher();
        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
    // fetcher intentionally omitted; callers pass stable deps only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken]);

  return { data, error, isLoading, refetch };
}

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
