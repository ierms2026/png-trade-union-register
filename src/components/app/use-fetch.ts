"use client";

import { useState, useEffect, useCallback } from "react";

// =============================================================================
// useFetch — minimal data-fetching hook.
//
// WHY NOT TanStack Query:
//   TanStack Query is great for complex apps with cache invalidation,
//   optimistic updates, etc. But for this app's read-heavy views, a
//   simple hook is easier to reason about and avoids pulling in a
//   QueryClientProvider wrapper.
//
// RETURNS:
//   { data, loading, error, refetch }
//
// USAGE:
//   const { data, loading, error, refetch } = useFetch<MyType>("/api/foo");
//   if (loading) return <Skeleton />;
//   if (error) return <ErrorState onRetry={refetch} />;
//   return <Actual data={data} />;
//
// REFETCH:
//   The refetch function re-runs the fetch. Useful for:
//     - The ErrorState retry button.
//     - After a mutation (e.g., "create task" → refetch the task list).
// =============================================================================

interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useFetch<T = unknown>(
  url: string | null,
  options?: RequestInit,
): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(url !== null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // refetch bumps the nonce, which triggers the effect below to re-run.
  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    // If url is null, we don't fetch (the caller controls when to start).
    if (!url) {
      // These setState calls are intentional — when the URL changes to null,
      // we clear the previous data so the caller doesn't render stale state.
      // The react-hooks/set-state-in-effect rule flags this pattern, but
      // for a data-fetching hook it's the correct behavior.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(url, {
      ...options,
      // credentials: "include" so the session cookie is sent.
      credentials: "include",
      headers: {
        ...(options?.headers ?? {}),
      },
    })
      .then(async (res) => {
        if (cancelled) return;
        // 401 = not authenticated. We return null data + an error so the
        // caller can decide how to handle it (usually: redirect to login).
        if (res.status === 401) {
          setData(null);
          setError("Authentication required.");
          setLoading(false);
          return;
        }
        // Try to parse JSON regardless of status — most error responses
        // have a JSON body with an `error` field.
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          if (!res.ok) {
            setError(`Request failed (${res.status}).`);
            setLoading(false);
            return;
          }
          setData(null);
          setLoading(false);
          return;
        }
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error || `Request failed (${res.status}).`);
          setData(null);
        } else {
          setData(json);
          setError(null);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Network error.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
     
  }, [url, nonce]);

  return { data, loading, error, refetch };
}
