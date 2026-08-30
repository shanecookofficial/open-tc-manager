"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  initialData?: T,
): UseAsyncState<T> {
  const [data, setData] = useState<T | undefined>(initialData);
  const [error, setError] = useState<ApiClientError | Error | undefined>();
  const [isLoading, setIsLoading] = useState(initialData === undefined);
  const [reloadToken, setReloadToken] = useState(0);
  const requestSeqRef = useRef(0);

  const refetch = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    const seq = ++requestSeqRef.current;

    const run = async () => {
      if (data === undefined) {
        setIsLoading(true);
      }
      setError(undefined);

      try {
        const result = await fetcher();
        if (seq === requestSeqRef.current) {
          setData(result);
        }
      } catch (err) {
        if (seq === requestSeqRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (seq === requestSeqRef.current) {
          setIsLoading(false);
        }
      }
    };

    void run();

    return () => {
      requestSeqRef.current += 1;
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
