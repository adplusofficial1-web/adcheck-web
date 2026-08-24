"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type DoneImage = { filename: string; status: string };

export type SubmissionStatus = {
  id: string;
  status: "processing" | "passed" | "needs_review" | "failed";
  imagesTotal: number;
  imagesDone: number;
  doneImages: DoneImage[];
};

interface UseSubmissionStatusOptions {
  /** Default 1500ms — fast enough to feel live, gentle on the API/DB. */
  pollIntervalMs?: number;
  onComplete?: (status: SubmissionStatus) => void;
  onFailed?: (status: SubmissionStatus) => void;
}

/**
 * Polls GET /api/submissions/[id]/status while a submission is still
 * processing, for the real-time Processing screen. Self-rescheduling
 * setTimeout (not setInterval) so a slow response never overlaps with the
 * next request; stops automatically once the submission leaves
 * "processing" or the component unmounts.
 */
export function useSubmissionStatus(
  submissionId: string,
  opts: UseSubmissionStatusOptions = {}
) {
  const { pollIntervalMs = 1500, onComplete, onFailed } = opts;
  const [data, setData] = useState<SubmissionStatus | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onFailedRef = useRef(onFailed);
  onCompleteRef.current = onComplete;
  onFailedRef.current = onFailed;

  const poll = useCallback(
    async function pollOnce() {
      if (stoppedRef.current) return;
      try {
        const res = await fetch(`/api/submissions/${submissionId}/status`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`ตรวจสอบสถานะล้มเหลว (HTTP ${res.status})`);
        const json: SubmissionStatus = await res.json();
        setData(json);
        setConnectionError(null);

        if (json.status === "failed") {
          stoppedRef.current = true;
          onFailedRef.current?.(json);
          return;
        }
        if (json.status !== "processing") {
          stoppedRef.current = true;
          onCompleteRef.current?.(json);
          return;
        }
      } catch (err) {
        // Network hiccups shouldn't stop polling — surface a quiet banner
        // and keep retrying on the same cadence.
        setConnectionError(err instanceof Error ? err.message : "เชื่อมต่อไม่สำเร็จ");
      } finally {
        if (!stoppedRef.current) {
          timerRef.current = setTimeout(pollOnce, pollIntervalMs);
        }
      }
    },
    [submissionId, pollIntervalMs]
  );

  useEffect(() => {
    stoppedRef.current = false;
    poll();
    return () => {
      stoppedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [poll]);

  return { data, connectionError };
}
