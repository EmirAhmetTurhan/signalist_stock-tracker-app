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
    // ── Add to My Strategies state (moved outside conditional to respect Rules of Hooks) ──
    const [addingIds, setAddingIds] = useState<Set<number>>(new Set());
    const [addingAll, setAddingAll] = useState(false);

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

    // ── Add to My Strategies handlers (top-level to respect Rules of Hooks) ──

    const handleAddStrategy = useCallback(async (ds: DiscoveryStrategyResult) => {
        if (!report) return;
        if (addingIds.has(ds.rank)) return;
        const sym = report.discoveryConfig?.symbol || report.symbol;
        const interv = report.discoveryConfig?.interval || '';
        setAddingIds(prev => new Set(prev).add(ds.rank));
        try {
            const res = await addDiscoveredStrategy(
                report._id,
                ds,
                sym,
                interv,
            );
            if (res.success) {
                toast.success(`"${res.name}" added to TA Strategies`);
            } else {
                toast.error(res.error || 'Failed to add strategy');
            }
        } catch {
            toast.error('An unexpected error occurred');
        } finally {
            setAddingIds(prev => {
                const next = new Set(prev);
                next.delete(ds.rank);
                return next;
            });
        }
    }, [report, addingIds]);

    const handleAddAll = useCallback(async () => {
        if (!report) return;
        const results = (report.discoveryResults || []) as DiscoveryStrategyResult[];
        const sym = report.discoveryConfig?.symbol || report.symbol;
        const interv = report.discoveryConfig?.interval || '';
        setAddingAll(true);
        try {
            for (const ds of results) {
                if (addingIds.has(ds.rank)) continue;
                setAddingIds(prev => new Set(prev).add(ds.rank));
                const res = await addDiscoveredStrategy(
                    report._id,
                    ds,
                    sym,
                    interv,
                );
                if (!res.success) {
                    toast.error(`Failed to add #${ds.rank}: ${res.error}`);
                }
                setAddingIds(prev => {
                    const next = new Set(prev);
                    next.delete(ds.rank);
                    return next;
                });
            }
            toast.success('All strategies added to TA');
        } catch {
            toast.error('An unexpected error occurred');
        } finally {
            setAddingAll(false);
        }
    }, [report, addingIds]);

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
                                {new Date(report.createdAt).toLocaleString('tr-TR', {
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
                                    if (!confirm('Bu raporu silmek istediğine emin misin? İlişkili tüm bildirimler de silinecek.')) return;
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
                            <Timer className="w-3.5 h-3.5" />
                            Duration:{' '}
                            {report.discoveryDuration
                                ? report.discoveryDuration >= 60_000
                                    ? `${(report.discoveryDuration / 60_000).toFixed(1)} min`
                                    : `${(report.discoveryDuration / 1000).toFixed(1)}s`
                                : 'N/A'}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <BarChart2 className="w-3.5 h-3.5" />
                            Best Validated WR:{' '}
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

                    {/* ── Add All Button ─────────────────────────────────────── */}
                    {results.length > 1 && (
                        <div className="flex justify-end mb-3">
                            <button
                                onClick={handleAddAll}
                                disabled={addingAll}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 disabled:bg-emerald-600/10 disabled:cursor-not-allowed text-emerald-400 text-xs font-medium border border-emerald-600/30 transition-all duration-200"
                            >
                                {addingAll ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <Plus className="w-3.5 h-3.5" />
                                )}
                                {addingAll ? 'Adding All...' : `Add All (${results.length}) to My Strategies`}
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
                                        <th className="py-3 px-4 text-right">Best WR</th>
                                        <th className="py-3 px-4 text-right">Validated WR</th>
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
                                            <td className="py-3 px-4 text-right font-medium text-white">
                                                {ds.bestWinRate.toFixed(1)}%
                                            </td>
                                            <td className="py-3 px-4 text-right font-medium text-amber-400">
                                                {ds.validatedWinRate.toFixed(1)}%
                                            </td>
                                            <td className="py-3 px-4 text-right text-gray-400">
                                                {ds.totalSignals}
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <button
                                                    onClick={() => handleAddStrategy(ds)}
                                                    disabled={addingIds.has(ds.rank)}
                                                    className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600/20 hover:bg-emerald-600/30 disabled:bg-emerald-600/10 disabled:cursor-not-allowed text-emerald-400 text-xs font-medium border border-emerald-600/30 transition-all duration-200 mx-auto"
                                                >
                                                    {addingIds.has(ds.rank) ? (
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                    ) : (
                                                        <Check className="w-3 h-3" />
                                                    )}
                                                    {addingIds.has(ds.rank) ? 'Adding...' : 'Add to TA'}
                                                </button>
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
                            {new Date(report.createdAt).toLocaleString('tr-TR', {
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
                                if (!confirm('Bu raporu silmek istediğine emin misin? İlişkili tüm bildirimler de silinecek.')) return;
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
