'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, BarChart2, Sparkles, Timer, Loader2, AlertTriangle, Check, Plus, Trash2 } from 'lucide-react';
import { getReportById } from '@/lib/actions/report.actions';
import { toast } from 'sonner';
import { addDiscoveredStrategy } from '@/lib/actions/saved-strategy.actions';
import MarkdownRenderer from '@/components/ai/MarkdownRenderer';

// ─── Types (mirrored from report.model.ts for client-side use) ─────────────────

interface DiscoveryStrategyResult {
    combo: string[];
    bestParams: Record<string, number>;
    bestWinRate: number;
    validatedWinRate: number;
    overfittingRisk: number;
    riskLevel: 'low' | 'medium' | 'high';
    totalSignals: number;
    rank: number;
    badge: string;
}

interface DiscoveryConfig {
    symbol: string;
    interval: string;
    years: number;
}

// ─── Page Component ──────────────────────────────────────────────────────────

export default function ReportDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [report, setReport] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // ── Add to My Strategies state ──
    const [savingIds, setSavingIds] = useState<Set<number>>(new Set());       // "Save to Library" loading
    const [navigatingIds, setNavigatingIds] = useState<Set<number>>(new Set()); // "Save & Go to TA" loading
    const [savingAll, setSavingAll] = useState(false);

    // Fetch report on mount
    useEffect(() => {
        getReportById(id).then((res) => {
            if (!res.success || !res.report) {
                setError(res.error || 'Report not found');
            } else {
                setReport(res.report);
            }
            setLoading(false);
        });
    }, [id]);

    // ── Handler 1: "Save to Library" — saves strategy, stays on page ──
    const handleSaveToLibrary = useCallback(async (ds: DiscoveryStrategyResult) => {
        if (!report) return;
        if (savingIds.has(ds.rank) || navigatingIds.has(ds.rank)) return;
        const sym = report.discoveryConfig?.symbol || report.symbol;
        const interv = report.discoveryConfig?.interval || '';
        setSavingIds(prev => new Set(prev).add(ds.rank));
        try {
            const res = await addDiscoveredStrategy(
                report._id,
                ds,
                sym,
                interv,
            );
            if (res.success) {
                toast.success(`"${res.name}" saved to library`);
            } else {
                toast.error(res.error || 'Failed to save strategy');
            }
        } catch {
            toast.error('An unexpected error occurred');
        } finally {
            setSavingIds(prev => {
                const next = new Set(prev);
                next.delete(ds.rank);
                return next;
            });
        }
    }, [report, savingIds, navigatingIds]);

    // ── Handler 2: "Save & Go to TA" — saves strategy, then navigates to TA page ──
    const handleSaveAndGoToTA = useCallback(async (ds: DiscoveryStrategyResult) => {
        if (!report) return;
        if (savingIds.has(ds.rank) || navigatingIds.has(ds.rank)) return;
        const sym = report.discoveryConfig?.symbol || report.symbol;
        const interv = report.discoveryConfig?.interval || '';
        const years = report.discoveryConfig?.years ?? 2;
        setNavigatingIds(prev => new Set(prev).add(ds.rank));
        try {
            const res = await addDiscoveredStrategy(
                report._id,
                ds,
                sym,
                interv,
            );
            if (res.success) {
                toast.success(`"${res.name}" saved — redirecting to TA...`);
                const strategyKey = `saved_${res.strategyId}`;
                const indParam = ds.combo.join(',');
                const params = new URLSearchParams();
                params.set('strategy', strategyKey);
                params.set('ind', indParam);
                params.set('symbol', sym);
                params.set('interval', interv);
                // CRITICAL: Pass years so TA page loads the same data range as the discovery
                params.set('years', years.toString());
                // Pass discovered params via 'p' for the TA page to apply optimized values
                if (ds.bestParams && Object.keys(ds.bestParams).length > 0) {
                    params.set('p', JSON.stringify(ds.bestParams));
                }
                router.push(`/ta?${params.toString()}`);
            } else {
                toast.error(res.error || 'Failed to save strategy');
            }
        } catch {
            toast.error('An unexpected error occurred');
        } finally {
            setNavigatingIds(prev => {
                const next = new Set(prev);
                next.delete(ds.rank);
                return next;
            });
        }
    }, [report, savingIds, navigatingIds, router]);

    // ── Handler: "Save All to Library" — saves all strategies, stays on page ──
    const handleSaveAll = useCallback(async () => {
        if (!report) return;
        const results = (report.discoveryResults || []) as DiscoveryStrategyResult[];
        const sym = report.discoveryConfig?.symbol || report.symbol;
        const interv = report.discoveryConfig?.interval || '';
        setSavingAll(true);
        try {
            for (const ds of results) {
                if (savingIds.has(ds.rank) || navigatingIds.has(ds.rank)) continue;
                setSavingIds(prev => new Set(prev).add(ds.rank));
                const res = await addDiscoveredStrategy(
                    report._id,
                    ds,
                    sym,
                    interv,
                );
                if (!res.success) {
                    toast.error(`Failed to save #${ds.rank}: ${res.error}`);
                }
                setSavingIds(prev => {
                    const next = new Set(prev);
                    next.delete(ds.rank);
                    return next;
                });
            }
            toast.success('All strategies saved to library');
        } catch {
            toast.error('An unexpected error occurred');
        } finally {
            setSavingAll(false);
        }
    }, [report, savingIds, navigatingIds]);

    // ── Loading state ────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="max-w-4xl mx-auto py-8 px-6">
                <div className="animate-pulse bg-white/5 rounded-2xl h-96 border border-white/10" />
            </div>
        );
    }

    // ── Error / Not Found state ──────────────────────────────────────────────

    if (error || !report) {
        return (
            <div className="max-w-4xl mx-auto py-8 px-6">
                <Link
                    href="/archive"
                    className="flex items-center gap-2 text-gray-500 hover:text-gray-300 transition-colors mb-6 w-fit"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Archive</span>
                </Link>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
                    <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-white mb-2">Report Not Found</h2>
                    <p className="text-gray-400">{error || 'The requested report could not be found.'}</p>
                </div>
            </div>
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DISCOVERY REPORT VIEW
    // ═══════════════════════════════════════════════════════════════════════════
    if (report.type === 'discovery') {
        const config = report.discoveryConfig as DiscoveryConfig | undefined;
        const results = (report.discoveryResults || []) as DiscoveryStrategyResult[];
        const best = results[0];
        const isReoptimized = !!report.rerunOfArtifactId;
        const symbol = config?.symbol || report.symbol;
        const interval = config?.interval || '';

        return (
            <div className="max-w-5xl mx-auto py-8 px-6">
                <Link
                    href="/archive"
                    className="flex items-center gap-2 text-gray-500 hover:text-gray-300 transition-colors mb-6 w-fit"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Archive</span>
                </Link>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
                    {/* ── Header ────────────────────────────────────────────── */}
                    <div className="flex items-center justify-between mb-6 pb-6 border-b border-gray-800">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                                    <Sparkles className="w-5 h-5 text-amber-400" />
                                    {report.symbol} Strategy Discovery
                                </h1>
                                <span className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-400 text-xs font-medium border border-amber-500/30">
                                    Discovery
                                </span>
                                {isReoptimized && (
                                    <span className="px-2.5 py-1 rounded bg-violet-500/20 text-violet-400 text-xs font-medium border border-violet-500/30">
                                        Re-Optimized
                                    </span>
                                )}
                            </div>
                            <p className="text-gray-400 text-sm">
                                Generated on{' '}
                                {new Date(report.createdAt).toLocaleString('en-US', {
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                })}
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={async () => {
                                    if (!confirm('Are you sure you want to delete this report? All associated notifications will also be removed.')) return;
                                    try {
                                        const { deleteReport } = await import('@/lib/actions/report.actions');
                                        const res = await deleteReport(report._id);
                                        if (res.success) {
                                            toast.success('Report deleted successfully');
                                            router.push('/archive');
                                        } else {
                                            toast.error(res.error || 'Failed to delete report');
                                        }
                                    } catch {
                                        toast.error('An unexpected error occurred');
                                    }
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium border border-red-500/30 transition-colors"
                                title="Delete report"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete
                            </button>
                            <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20">
                                <Sparkles className="w-8 h-8 text-amber-400" />
                            </div>
                        </div>
                    </div>

                    {/* ── Config Summary Cards ──────────────────────────────── */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <ConfigCard label="Symbol" value={config?.symbol || report.symbol} />
                        <ConfigCard label="Interval" value={config?.interval || 'N/A'} />
                        <ConfigCard label="Data Range" value={config ? `${config.years} years` : 'N/A'} />
                        <ConfigCard
                            label="Combinations"
                            value={report.totalCombinationsScreened?.toLocaleString() || 'N/A'}
                        />
                    </div>

                    {/* ── Pipeline Summary ──────────────────────────────────── */}
                    <div className="flex flex-wrap items-center gap-4 mb-6 text-sm text-gray-400">
                        <span className="flex items-center gap-1.5">
                            <BarChart2 className="w-3.5 h-3.5" />
                            Win Rate:{' '}
                            <span className="text-amber-400 font-medium">
                                {best ? `${best.validatedWinRate.toFixed(1)}%` : 'N/A'}
                            </span>
                        </span>
                        {best && (
                            <span className="flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5" />
                                Top Strategy:{' '}
                                <span className="text-violet-300 font-mono text-xs">
                                    {best.combo.join(' + ')}
                                </span>
                            </span>
                        )}
                    </div>

                    {/* ── Save All Button ─────────────────────────────────────── */}
                    {results.length > 1 && (
                        <div className="flex justify-end mb-3">
                            <button
                                onClick={handleSaveAll}
                                disabled={savingAll}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-600/20 hover:bg-gray-600/30 disabled:bg-gray-600/10 disabled:cursor-not-allowed text-gray-400 text-xs font-medium border border-gray-600/30 transition-all duration-200"
                            >
                                {savingAll ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <Plus className="w-3.5 h-3.5" />
                                )}
                                {savingAll ? 'Saving All...' : `Save All (${results.length}) to Library`}
                            </button>
                        </div>
                    )}

                    {/* ── Strategies Table ──────────────────────────────────── */}
                    {results.length > 0 ? (
                        <div className="overflow-x-auto mb-6">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800">
                                        <th className="py-3 px-4 text-left">#</th>
                                        <th className="py-3 px-4 text-left">Strategy</th>
                                        <th className="py-3 px-4 text-right">Win Rate</th>
                                        <th className="py-3 px-4 text-right">Signals</th>
                                        <th className="py-3 px-4 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map((ds) => (
                                        <tr
                                            key={ds.rank}
                                            className="border-b border-gray-800/50 hover:bg-white/[0.02] transition-colors"
                                        >
                                            <td className="py-3 px-4 text-gray-500">#{ds.rank}</td>
                                            <td className="py-3 px-4">
                                                <div className="flex flex-wrap gap-1">
                                                    {ds.combo.map((key) => (
                                                        <span
                                                            key={key}
                                                            className="px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 text-xs font-mono border border-violet-500/20"
                                                        >
                                                            {key}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-right font-medium text-amber-400">
                                                {ds.validatedWinRate.toFixed(1)}%
                                            </td>
                                            <td className="py-3 px-4 text-right text-gray-400">
                                                {ds.totalSignals}
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    {/* Button 1: Save to Library (no navigation) */}
                                                    <button
                                                        onClick={() => handleSaveToLibrary(ds)}
                                                        disabled={savingIds.has(ds.rank) || navigatingIds.has(ds.rank)}
                                                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-violet-600/20 hover:bg-violet-600/30 disabled:bg-violet-600/10 disabled:cursor-not-allowed text-violet-400 text-xs font-medium border border-violet-600/30 transition-all duration-200"
                                                        title="Save strategy to your library without leaving this page"
                                                    >
                                                        {savingIds.has(ds.rank) ? (
                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                        ) : (
                                                            <Plus className="w-3 h-3" />
                                                        )}
                                                        {savingIds.has(ds.rank) ? '...' : 'Save'}
                                                    </button>
                                                    {/* Button 2: Save & Go to TA (save + navigate) */}
                                                    <button
                                                        onClick={() => handleSaveAndGoToTA(ds)}
                                                        disabled={savingIds.has(ds.rank) || navigatingIds.has(ds.rank)}
                                                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-600/20 hover:bg-emerald-600/30 disabled:bg-emerald-600/10 disabled:cursor-not-allowed text-emerald-400 text-xs font-medium border border-emerald-600/30 transition-all duration-200"
                                                        title="Save strategy and open it on the TA page"
                                                    >
                                                        {navigatingIds.has(ds.rank) ? (
                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                        ) : (
                                                            <Check className="w-3 h-3" />
                                                        )}
                                                        {navigatingIds.has(ds.rank) ? '...' : 'Go to TA'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-500">
                            No strategy results available for this discovery report.
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════════════════
    // ANALYSIS REPORT VIEW (existing behavior)
    // ═══════════════════════════════════════════════════════════════════════════
    return (
        <div className="max-w-4xl mx-auto py-8 px-6">
            <Link
                href="/archive"
                className="flex items-center gap-2 text-gray-500 hover:text-gray-300 transition-colors mb-6 w-fit"
            >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Archive</span>
            </Link>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
                <div className="flex items-center justify-between mb-8 pb-6 border-b border-white/10">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-2xl font-bold text-white">{report.symbol} Analysis Report</h1>
                            <span className="px-2.5 py-1 rounded bg-blue-500/20 text-blue-400 text-xs font-medium border border-blue-500/30">
                                {report.indicator}
                            </span>
                        </div>
                        <p className="text-gray-400 text-sm">
                            Generated on{' '}
                            {new Date(report.createdAt).toLocaleString('en-US', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                            })}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={async () => {
                                if (!confirm('Are you sure you want to delete this report? All associated notifications will also be removed.')) return;
                                try {
                                    const { deleteReport } = await import('@/lib/actions/report.actions');
                                    const res = await deleteReport(report._id);
                                    if (res.success) {
                                        toast.success('Report deleted successfully');
                                        router.push('/archive');
                                    } else {
                                        toast.error(res.error || 'Failed to delete report');
                                    }
                                } catch {
                                    toast.error('An unexpected error occurred');
                                }
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium border border-red-500/30 transition-colors"
                            title="Delete report"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                        </button>
                        <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                            <BarChart2 className="w-8 h-8 text-blue-400" />
                        </div>
                    </div>
                </div>

                <div className="prose prose-invert max-w-none">
                    <MarkdownRenderer
                        content={report.result || report.errorMessage || 'No content generated.'}
                    />
                </div>
            </div>
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConfigCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
            <p className="text-lg font-semibold text-white">{value}</p>
        </div>
    );
}
