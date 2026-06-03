// components/ta/DeepDiscoveryProgress.tsx
"use client";

import { useState, useEffect } from "react";
import { Loader2, Zap, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { PHASE_NAMES } from "@/lib/ta/discovery-types";

interface DeepDiscoveryProgressProps {
    jobId: string;
    onComplete?: (results: any) => void;
    onError?: (error: string) => void;
}

export default function DeepDiscoveryProgress({ jobId, onComplete, onError }: DeepDiscoveryProgressProps) {
    const [status, setStatus] = useState<'queued' | 'running' | 'completed' | 'failed'>('queued');
    const [progress, setProgress] = useState(0);
    const [currentPhase, setCurrentPhase] = useState(0);
    const [phaseDetail, setPhaseDetail] = useState("Initializing...");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!jobId) return;

        let pollInterval: NodeJS.Timeout;

        const pollStatus = async () => {
            try {
                const res = await fetch(`/api/jobs/${jobId}`);
                if (!res.ok) {
                    if (res.status === 404) {
                        setStatus('failed');
                        setErrorMessage('Job not found.');
                        if (onError) onError('Job not found.');
                        clearInterval(pollInterval);
                    }
                    return;
                }

                const data = await res.json();

                // Batch state updates: use a single timestamp to avoid multiple re-renders
                setStatus(data.status);
                setProgress(data.progress || 0);
                setCurrentPhase(data.currentPhase || 0);
                setPhaseDetail(data.phaseDetail || "");

                if (data.status === 'completed') {
                    clearInterval(pollInterval);
                    if (onComplete) onComplete(data);
                } else if (data.status === 'failed') {
                    clearInterval(pollInterval);
                    setErrorMessage(data.errorMessage || "An unknown error occurred.");
                    if (onError) onError(data.errorMessage || "An unknown error occurred.");
                }
            } catch (err) {
                console.error("Failed to poll job status:", err);
            }
        };

        // Poll every 5 seconds (reduced from 2s to reduce main-thread pressure)
        pollInterval = setInterval(pollStatus, 5000);
        // Initial fetch
        pollStatus();

        return () => clearInterval(pollInterval);
    }, [jobId, onComplete, onError]);

    const isTerminal = status === 'completed' || status === 'failed';

    return (
        <div className="bg-gray-900/60 border border-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    {status === 'running' && <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />}
                    {status === 'queued' && <Zap className="w-4 h-4 text-gray-500" />}
                    {status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    {status === 'failed' && <XCircle className="w-4 h-4 text-red-500" />}
                    <h4 className="text-sm font-semibold text-gray-200">
                        {status === 'completed' ? 'Discovery Complete' :
                            status === 'failed' ? 'Discovery Failed' :
                                currentPhase > 0 ? `Phase ${currentPhase}/5: ${PHASE_NAMES[currentPhase]}` :
                                    'Starting Discovery...'}
                    </h4>
                </div>
                {!isTerminal && (
                    <span className="text-xs font-medium text-amber-500">{progress}%</span>
                )}
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden mb-3">
                <div
                    className={cn(
                        "h-full transition-all duration-500 ease-in-out",
                        status === 'failed' ? "bg-red-500" :
                            status === 'completed' ? "bg-emerald-500" :
                                "bg-gradient-to-r from-amber-600 to-amber-400"
                    )}
                    style={{ width: `${Math.max(5, progress)}%` }}
                />
            </div>

            {/* Details & Errors */}
            {status === 'failed' && errorMessage ? (
                <div className="flex items-start gap-2 mt-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-md text-xs text-red-400">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                </div>
            ) : (
                <p className="text-xs text-gray-400 flex items-center justify-between">
                    <span>{phaseDetail}</span>
                    {status === 'running' && (
                        <span className="animate-pulse text-amber-600/70">Processing...</span>
                    )}
                </p>
            )}
        </div>
    );
}
