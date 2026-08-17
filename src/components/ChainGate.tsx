"use client";

import { useCallback, useEffect, useState } from "react";

import { codeHashes, CONFIGURED, forgetCodeHashes } from "@/lib/chain";

import { readable } from "./Toast";
import { Unconfigured, Unreachable } from "./Unconfigured";

/**
 * Establish what the contracts are running before letting a page read them.
 *
 * Every query in this app is encrypted against the contracts' code hashes, so if they
 * cannot be established, nothing on any page can load. Handling that once here rather than
 * four times in four pages is not only shorter — it is the difference between one honest
 * message and four screens of skeletons that never resolve.
 *
 * Children render while the answer is in flight. The pages already show their own loading
 * states, and blocking them behind a spinner would trade a moment of partial content for a
 * moment of nothing.
 */
export function ChainGate({ children }: { children: React.ReactNode }) {
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!CONFIGURED) return;
    let cancelled = false;

    void codeHashes()
      .then(() => {
        if (!cancelled) setFailure(null);
      })
      .catch((e) => {
        if (!cancelled) setFailure(readable(e));
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    forgetCodeHashes();
    setFailure(null);
    setAttempt((n) => n + 1);
  }, []);

  if (!CONFIGURED) return <Unconfigured />;
  if (failure) return <Unreachable detail={failure} onRetry={retry} />;
  return <>{children}</>;
}
