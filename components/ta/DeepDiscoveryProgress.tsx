// components/ta/DeepDiscoveryProgress.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Zap, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { PHASE_NAMES } from "@/lib/ta/discovery-types";

interface DeepDiscoveryProgressProps {
    jobId: string;
    onComplete?: (results: any) => void;
    onError?: (error: string) => void;
}

const POLL_INTERVAL_MS = 10000; // 10 seconds — reduce server load
const TIMEOUT_MS = 300_000; // 5 minutes before showing timeout warning

export default function DeepDiscoveryProgress({
    jobId,
    onComplete,
    onError,
}: DeepDiscoveryProgressProps) {
    const [status, setStatus] = useState<"queued" | "running" | "completed" | "failed">("queued");
    const [progress, setProgress] = useState(0);
    const [currentPhase, setCurrentPhase] = useState(0);
    const [phaseDetail, setPhaseDetail] = useState("Initializing...");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isTimedOut, setIsTimedOut] = useState(false);

    // Refs for stable callbacks (prevent useEffect re-runs)
    const onCompleteRef = useRef(onComplete);
    const onErrorRef = useRef(onError);
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;

    // Ref for the polling interval (needed in catch block + cleanup)
    const pollRef = useRef<NodeJS.Timeout | null>(null);
    // Track poll count for timeout
    const pollCountRef = useRef(0);
    // Guard against overlapping requests
    const isPollingRef = useRef(false);

    useEffect(() => {
        if (!jobId) return;

        let cancelled = false;
        pollCountRef.current = 0;
        setIsTimedOut(false);

        const clearPolling = () => {
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
        };

        const pollStatus = async () => {
            // Prevent overlapping requests
            if (isPollingRef.current) return;
            isPollingRef.current = true;

            try {
                const res = await fetch(`/api/jobs/${jobId}`);
                if (cancelled) return;

                if (!res.ok) {
                    const errText = await res.text().catch(() => "");
                    if (res.status === 404) {
                        setStatus("failed");
                        setErrorMessage("Job not found.");
                        onErrorRef.current?.("Job not found.");
                    } else if (res.status >= 500) {
                        // Server error: keep polling but warn (don't clear)
                        console.warn(
                            `[DiscoveryPoll] Server error ${res.status}: ${errText.slice(0, 200)}`,
                        );
                        // Don't clear polling on server errors — transient
                        isPollingRef.current = false;
                        return;
                    }
                    // For other errors (e.g. 400), stop polling
                    clearPolling();
                    isPollingRef.current = false;
                    return;
                }

                const data = await res.json();
                if (cancelled) { isPollingRef.current = false; return; }

                // Batch state updates directly from API response (no stale closure fallbacks)
                setStatus(data.status ?? "running");
                setProgress(
                    typeof data.progress === "number"
                        ? Math.max(0, Math.min(100, data.progress))
                        : 0,
                );
                setCurrentPhase(
                    typeof data.currentPhase === "number"
                        ? data.currentPhase
                        : typeof data.currentPhase === "string"
                          ? Number(data.currentPhase)
                          : 0,
                );
                setPhaseDetail(
                    typeof data.phaseDetail === "string" && data.phaseDetail.length > 0
                        ? data.phaseDetail
                        : "Processing...",
                );

                if (data.status === "completed") {
                    clearPolling();
                    onCompleteRef.current?.(data);
                } else if (data.status === "failed") {
                    clearPolling();
                    const msg = data.errorMessage || "An unknown error occurred.";
                    setErrorMessage(msg);
                    onErrorRef.current?.(msg);
                }
                // else: still running/queued — keep polling
            } catch (err) {
                // Network error: clear interval to stop zombie polling
                console.error("[DiscoveryPoll] Network error:", err);
                clearPolling();
                if (!cancelled && !document.hidden) {
                    setErrorMessage(
                        "Connection lost. The job may still be running on the server.",
                    );
                    onErrorRef.current?.(
                        "Connection lost during discovery polling.",
                    );
                }
            } finally {
                isPollingRef.current = false;
            }
        };

        // Initial fetch
        pollStatus();

        // Poll every 5 seconds
        pollRef.current = setInterval(() => {
            pollCountRef.current += 1;

            // Timeout check (pollCount * interval = elapsed ms)
            const elapsedMs = pollCountRef.current * POLL_INTERVAL_MS;
            if (elapsedMs >= TIMEOUT_MS && !isTimedOut) {
                setIsTimedOut(true);
                // Don't stop polling — job may still complete, just warn the user
            }

            pollStatus();
        }, POLL_INTERVAL_MS);

        return () => {
            cancelled = true;
            clearPolling();
        };
    }, [jobId]); // Only re-run on jobId change — refs handle callback stability

    const isTerminal = status === "completed" || status === "failed";

    return (
        <div className="bg-gray-900/60 border border-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    {status === "running" && (
                        <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
                    )}
                    {status === "queued" && <Zap className="w-4 h-4 text-gray-500" />}
                    {status === "completed" && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    )}
                    {status === "failed" && <XCircle className="w-4 h-4 text-red-500" />}
                    <h4 className="text-sm font-semibold text-gray-200">
                        {status === "completed"
                            ? "Discovery Complete"
                            : status === "failed"
                              ? "Discovery Failed"
                              : currentPhase > 0
                                ? `Phase ${currentPhase}/5: ${PHASE_NAMES[currentPhase] ?? `Phase ${currentPhase}`}`
                                : "Starting Discovery..."}
                    </h4>
                </div>
                {!isTerminal && (
                    <span className="text-xs font-medium text-amber-500">
                        {progress}%
                    </span>
                )}
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden mb-3">
                <div
                    className={cn(
                        "h-full transition-all duration-500 ease-in-out",
                        status === "failed"
                            ? "bg-red-500"
                            : status === "completed"
                              ? "bg-emerald-500"
                              : "bg-gradient-to-r from-amber-600 to-amber-400",
                    )}
                    style={{ width: `${Math.max(5, progress)}%` }}
                />
            </div>

            {/* Timeout Warning */}
            {isTimedOut && !isTerminal && (
                <div className="flex items-start gap-2 mt-2 mb-2 p-2.5 bg-yellow-500/10 border border-yellow-500/20 rounded-md text-xs text-yellow-400">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                        This job is taking longer than expected. It may still be running
                        on the server. You can close this dialog — results will be
                        available when complete.
                    </span>
                </div>
            )}

            {/* Details & Errors */}
            {status === "failed" && errorMessage ? (
                <div className="flex items-start gap-2 mt-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-md text-xs text-red-400">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                </div>
            ) : (
                <p className="text-xs text-gray-400 flex items-center justify-between">
                    <span>{phaseDetail}</span>
                    {status === "running" && (
                        <span className="animate-pulse text-amber-600/70">
                            Processing...
                        </span>
                    )}
                </p>
            )}
        </div>
    );
}