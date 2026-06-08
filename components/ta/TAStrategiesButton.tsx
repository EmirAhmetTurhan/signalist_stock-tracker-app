"use client";

import { Button } from "@/components/ui/button";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
    Plus,
    Trash2,
    Target,
    Check,
    Sparkles,
    Clock,
    Users,
    Shield,
    Lightbulb,
    Pin,
    PinOff,
    Edit3,
    ArrowUpDown,
    Loader2,
    X,
    BarChart3,
} from "lucide-react";
import CustomStrategyModal, {
    DeleteConfirmDialog,
    CustomStrategy,
    loadCustomStrategies,
    saveCustomStrategies,
    AVAILABLE_INDICATORS,
} from "@/components/panels/CustomStrategyModal";
import StrategyDiscoveryDialog from "@/components/panels/StrategyDiscoveryDialog";
import TAGlassDialog from "./TAGlassDialog";
import { cn } from "@/lib/utils";
import { INDICATOR_DETAILS } from "@/lib/constants/indicator-categories";
import {
    getSavedStrategies,
    togglePinStrategy,
    renameStrategy,
    deleteSavedStrategy,
} from "@/lib/actions/saved-strategy.actions";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────────

interface SavedStrategyItem {
    id: string;
    userId: string;
    name: string;
    indicators: string[];
    mode: string;
    lookForward: number;
    discoveredParams: Record<string, number> | null;
    discoveredWinRate: number | null;
    discoveredTotalSignals: number | null;
    discoveredSymbol: string | null;
    discoveredInterval: string | null;
    // Multi-metric discovery fields
    discoveredProfitFactor?: number | null;
    discoveredSharpeRatio?: number | null;
    discoveredAvgWin?: number | null;
    discoveredAvgLoss?: number | null;
    discoveredMaxDrawdown?: number | null;
    discoveredTotalReturn?: number | null;
    discoveredRegimeBreakdown?: Record<string, {
        winRate: number;
        totalSignals: number;
        wins: number;
        avgReturn: number;
        totalReturn: number;
    }> | null;
    pinned: boolean;
    sourceReportId: string | null;
    isDiscovered: boolean;
    createdAt: string | null;
    updatedAt: string | null;
}

type SortField = 'date' | 'name' | 'winRate' | 'signals' | 'sharpe' | 'profitFactor';
type SortDir = 'asc' | 'desc';

interface SortConfig {
    field: SortField;
    dir: SortDir;
}

// ─── Constants ───────────────────────────────────────────────────────────────────

const BUILT_IN_STRATEGIES = [
    {
        key: "rsi_cci_wt",
        label: "RSI + CCI + WaveTrend",
        description: "Trade when 3 indicators signal in the same direction",
        isBuiltIn: true,
    },
] as const;

const SORT_OPTIONS: { value: SortField; label: string }[] = [
    { value: 'date', label: 'Date' },
    { value: 'name', label: 'Name' },
    { value: 'winRate', label: 'Win Rate' },
    { value: 'signals', label: 'Signals' },
    { value: 'sharpe', label: 'Sharpe' },
    { value: 'profitFactor', label: 'Profit' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function getStrategyKey(id: string) {
    if (id.startsWith('custom_')) return id;
    return `saved_${id}`;
}

function isSavedKey(key: string) {
    return key.startsWith('saved_') || key.startsWith('custom_');
}

function parseSavedId(key: string) {
    if (key.startsWith('custom_')) return key;
    return key.replace('saved_', '');
}

// ─── Component ───────────────────────────────────────────────────────────────────

interface TAStrategiesButtonProps {
    userId?: string;
    candles?: any[];
    allData?: any;
    interval?: string;
    symbol?: string;
}

const TAStrategiesButton = ({ userId, candles, allData, interval, symbol }: TAStrategiesButtonProps) => {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const strategyParam = searchParams.get("strategy") || "";

    // ── Dialog state ──────────────────────────────────────────────────────────
    const [dialogOpen, setDialogOpen] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [discoveryOpen, setDiscoveryOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<SavedStrategyItem | null>(null);
    const [selectedStrategy, setSelectedStrategy] = useState<string>("");

    // ── MongoDB & Local strategies ────────────────────────────────────────────────
    const [savedStrategies, setSavedStrategies] = useState<SavedStrategyItem[]>([]);
    const [localStrategies, setLocalStrategies] = useState<CustomStrategy[]>([]);
    const [loadingSaved, setLoadingSaved] = useState(false);

    // ── Sort config per section ───────────────────────────────────────────────
    const [mySort, setMySort] = useState<SortConfig>({ field: 'date', dir: 'desc' });
    const [discoveredSort, setDiscoveredSort] = useState<SortConfig>({ field: 'winRate', dir: 'desc' });

    // ── Rename state ──────────────────────────────────────────────────────────
    const [renameTarget, setRenameTarget] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");

    // ── Pin/Rename loading ────────────────────────────────────────────────────
    const [togglingPin, setTogglingPin] = useState<Set<string>>(new Set());
    const [renamingStrategy, setRenamingStrategy] = useState<string | null>(null);
    const [deletingStrategy, setDeletingStrategy] = useState<Set<string>>(new Set());

    // ── Fetch saved strategies ────────────────────────────────────────────────
    const fetchSaved = useCallback(async () => {
        setLocalStrategies(loadCustomStrategies());
        if (!userId) return;
        setLoadingSaved(true);
        try {
            const res = await getSavedStrategies(userId);
            if (res.success) {
                setSavedStrategies(res.data as SavedStrategyItem[]);
            }
        } catch (e) {
            console.error('[TAStrategiesButton] fetch error:', e);
        } finally {
            setLoadingSaved(false);
        }
    }, [userId]);

    useEffect(() => {
        fetchSaved();
    }, [fetchSaved]);

    // ── Select from URL param ─────────────────────────────────────────────────
    useEffect(() => {
        setSelectedStrategy(strategyParam);
    }, [strategyParam]);

    const openDialog = useCallback(() => {
        setSelectedStrategy(strategyParam);
        setDialogOpen(true);
    }, [strategyParam]);

    // ── Filter & sort strategies ──────────────────────────────────────────────
    const allStrategies = useMemo(() => {
        const localItems: SavedStrategyItem[] = localStrategies.map(ls => ({
            id: ls.key,
            userId: userId || '',
            name: ls.name,
            indicators: ls.indicators,
            mode: ls.mode || 'all',
            lookForward: ls.lookForward || 14,
            discoveredParams: ls.params || null,
            discoveredWinRate: ls.discoveryWinRate || null,
            discoveredTotalSignals: ls.discoverySignalCount || null,
            discoveredSymbol: null,
            discoveredInterval: null,
            pinned: false,
            sourceReportId: null,
            isDiscovered: false,
            createdAt: new Date(ls.createdAt).toISOString(),
            updatedAt: new Date(ls.createdAt).toISOString(),
        }));
        return [...savedStrategies, ...localItems];
    }, [savedStrategies, localStrategies, userId]);

    const myStrategies = useMemo(() => {
        const items = allStrategies.filter(s => !s.isDiscovered);
        return sortStrategies(items, mySort);
    }, [allStrategies, mySort]);

    const discoveredStrategies = useMemo(() => {
        const items = allStrategies.filter(s => s.isDiscovered);
        return sortStrategies(items, discoveredSort);
    }, [allStrategies, discoveredSort]);

    function sortStrategies(items: SavedStrategyItem[], sort: SortConfig): SavedStrategyItem[] {
        const pinned = items.filter(s => s.pinned);
        const unpinned = items.filter(s => !s.pinned);

        const sorter = (a: SavedStrategyItem, b: SavedStrategyItem) => {
            let cmp = 0;
            switch (sort.field) {
                case 'date':
                    cmp = (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
                    break;
                case 'name':
                    cmp = a.name.localeCompare(b.name);
                    break;
                case 'winRate': {
                    const wa = a.discoveredWinRate ?? -1;
                    const wb = b.discoveredWinRate ?? -1;
                    cmp = wa - wb;
                    break;
                }
                case 'signals': {
                    const sa = a.discoveredTotalSignals ?? -1;
                    const sb = b.discoveredTotalSignals ?? -1;
                    cmp = sa - sb;
                    break;
                }
                case 'sharpe': {
                    const sha = a.discoveredSharpeRatio ?? -999;
                    const shb = b.discoveredSharpeRatio ?? -999;
                    cmp = sha - shb;
                    break;
                }
                case 'profitFactor': {
                    const pfa = a.discoveredProfitFactor ?? -999;
                    const pfb = b.discoveredProfitFactor ?? -999;
                    cmp = pfa - pfb;
                    break;
                }
            }
            return sort.dir === 'desc' ? -cmp : cmp;
        };

        return [...pinned.sort(sorter), ...unpinned.sort(sorter)];
    }

    // ── Toggle sort ───────────────────────────────────────────────────────────
    const toggleSort = useCallback((section: 'my' | 'discovered', field: SortField) => {
        const setter = section === 'my' ? setMySort : setDiscoveredSort;
        const current = section === 'my' ? mySort : discoveredSort;
        if (current.field === field) {
            setter({ field, dir: current.dir === 'desc' ? 'asc' : 'desc' });
        } else {
            setter({ field, dir: 'desc' });
        }
    }, [mySort, discoveredSort]);

    // ── Select strategy ───────────────────────────────────────────────────────
    const toggleStrategy = useCallback((key: string) => {
        setSelectedStrategy(prev => (prev === key ? "" : key));
    }, []);

    // ── Apply strategy ────────────────────────────────────────────────────────
    const applyStrategy = useCallback(() => {
        if (!selectedStrategy) return;
        const params = new URLSearchParams(searchParams.toString());

        if (selectedStrategy === "rsi_cci_wt") {
            params.set("strategy", "rsi_cci_wt");
            params.set("ind", "rsi,cci,wavetrend");
            params.delete("p");
        } else if (isSavedKey(selectedStrategy)) {
            const id = parseSavedId(selectedStrategy);
            const found = allStrategies.find(s => s.id === id);
            if (found) {
                params.set("strategy", selectedStrategy);
                params.set("ind", found.indicators.join(","));
                // Pass optimized params via URL if available
                if (found.discoveredParams && Object.keys(found.discoveredParams).length > 0) {
                    params.set("p", JSON.stringify(found.discoveredParams));
                } else {
                    params.delete("p");
                }
            }
        }

        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        router.refresh();
        setDialogOpen(false);
    }, [selectedStrategy, searchParams, pathname, router, allStrategies]);

    // ── Handle created custom strategy ────────────────────────────────────────
    const handleCreated = useCallback((_strategy: CustomStrategy) => {
        fetchSaved();
        setSelectedStrategy(_strategy.key);
    }, [fetchSaved]);

    // ── Handle pin toggle ─────────────────────────────────────────────────────
    const handleTogglePin = useCallback(async (e: React.MouseEvent, strategyId: string) => {
        e.stopPropagation();
        e.preventDefault();
        if (togglingPin.has(strategyId)) return;
        setTogglingPin(prev => new Set(prev).add(strategyId));
        try {
            const res = await togglePinStrategy(userId!, strategyId);
            if (res.success) {
                setSavedStrategies(prev => prev.map(s =>
                    s.id === strategyId ? { ...s, pinned: res.pinned } : s
                ));
            } else {
                toast.error(res.error || 'Failed to toggle pin');
            }
        } catch {
            toast.error('An unexpected error occurred');
        } finally {
            setTogglingPin(prev => {
                const next = new Set(prev);
                next.delete(strategyId);
                return next;
            });
        }
    }, [userId, togglingPin]);

    // ── Handle rename ─────────────────────────────────────────────────────────
    const startRename = useCallback((e: React.MouseEvent, item: SavedStrategyItem) => {
        e.stopPropagation();
        e.preventDefault();
        setRenameTarget(item.id);
        setRenameValue(item.name);
    }, []);

    const cancelRename = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        setRenameTarget(null);
        setRenameValue("");
    }, []);

    const confirmRename = useCallback(async (e: React.MouseEvent | React.KeyboardEvent) => {
        e.stopPropagation();
        if (!renameTarget || !renameValue.trim()) return;
        setRenamingStrategy(renameTarget);
        try {
            const res = await renameStrategy(userId!, renameTarget, renameValue.trim());
            if (res.success) {
                setSavedStrategies(prev => prev.map(s =>
                    s.id === renameTarget ? { ...s, name: renameValue.trim() } : s
                ));
                setRenameTarget(null);
                setRenameValue("");
                toast.success('Strategy renamed');
            } else {
                toast.error(res.error || 'Failed to rename');
            }
        } catch {
            toast.error('An unexpected error occurred');
        } finally {
            setRenamingStrategy(null);
        }
    }, [renameTarget, renameValue, userId]);

    // ── Handle delete ─────────────────────────────────────────────────────────
    const handleDelete = useCallback((item: SavedStrategyItem, e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setDeleteTarget(item);
    }, []);

    const confirmDelete = useCallback(async () => {
        if (!deleteTarget) return;
        const id = deleteTarget.id;

        if (id.startsWith('custom_')) {
            const existing = loadCustomStrategies();
            const filtered = existing.filter(s => s.key !== id);
            saveCustomStrategies(filtered);
            setLocalStrategies(filtered);
            
            if (selectedStrategy === id) {
                setSelectedStrategy("");
                const params = new URLSearchParams(searchParams.toString());
                params.delete("strategy");
                params.delete("ind");
                params.delete("p");
                router.replace(`${pathname}?${params.toString()}`, { scroll: false });
            }
            toast.success('Local strategy deleted');
            setDeleteTarget(null);
            return;
        }

        setDeletingStrategy(prev => new Set(prev).add(id));
        try {
            const res = await deleteSavedStrategy(userId!, id);
            if (res.success) {
                setSavedStrategies(prev => prev.filter(s => s.id !== id));
                if (selectedStrategy === getStrategyKey(id)) {
                    setSelectedStrategy("");
                    const params = new URLSearchParams(searchParams.toString());
                    params.delete("strategy");
                    params.delete("ind");
                    params.delete("p");
                    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
                }
                toast.success('Strategy deleted');
            } else {
                toast.error(res.error || 'Failed to delete');
            }
        } catch {
            toast.error('An unexpected error occurred');
        } finally {
            setDeletingStrategy(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
            setDeleteTarget(null);
        }
    }, [deleteTarget, userId, selectedStrategy, searchParams, pathname, router]);

    // ── Handle discovery apply ────────────────────────────────────────────────
    const handleDiscoveryApply = useCallback((discovered: { indicators: string[]; params: Record<string, number>; winRate: number; totalSignals?: number }) => {
        // Save strategy to localStorage (like CustomStrategyPanel does)
        const newStrategy: CustomStrategy = {
            key: `custom_${Date.now()}`,
            name: `Discovered — ${discovered.indicators.map(k =>
                AVAILABLE_INDICATORS.find(i => i.key === k)?.label ?? k.toUpperCase()
            ).join(' + ')}`,
            indicators: discovered.indicators,
            createdAt: Date.now(),
            mode: 'all',
            lookForward: Math.round(discovered.params?.lookForward ?? 14),
            params: discovered.params ? { ...discovered.params } : undefined,
            discoveryWinRate: discovered.winRate,
            discoverySignalCount: discovered.totalSignals ?? 0,
            isDiscovered: true,
        };
        const existing = loadCustomStrategies();
        saveCustomStrategies([newStrategy, ...existing]);

        // Set URL params — keep `ind` and `p`, replace `strategy`
        const params = new URLSearchParams(searchParams.toString());
        params.set("ind", discovered.indicators.join(","));
        if (discovered.params && Object.keys(discovered.params).length > 0) {
            params.set("p", JSON.stringify(discovered.params));
        }
        params.set("strategy", newStrategy.key);
        router.push(`${pathname}?${params.toString()}`);
        setDiscoveryOpen(false);
    }, [searchParams, pathname, router]);

    // ── Get selection label ───────────────────────────────────────────────────
    const clearStrategyFromURL = useCallback(() => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("strategy");
        params.delete("ind");
        params.delete("p");
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        router.refresh();
        setDialogOpen(false);
    }, [searchParams, pathname, router]);

    const getSelectionLabel = useCallback(() => {
        if (!selectedStrategy) return "Choose a strategy to apply";
        if (selectedStrategy === "rsi_cci_wt") return "RSI + CCI + WaveTrend";
        const id = parseSavedId(selectedStrategy);
        const found = allStrategies.find(s => s.id === id);
        if (found) {
            const wr = found.discoveredWinRate ? ` (${found.discoveredWinRate.toFixed(1)}%)` : '';
            return `${found.name}${wr}`;
        }
        return selectedStrategy;
    }, [selectedStrategy, allStrategies]);

    const isActive = strategyParam !== "";

    // ── Sort button renderer ──────────────────────────────────────────────────
    const SortButton = ({ section, field, label }: { section: 'my' | 'discovered'; field: SortField; label: string }) => {
        const current = section === 'my' ? mySort : discoveredSort;
        const isActive = current.field === field;
        return (
            <button
                onClick={() => toggleSort(section, field)}
                className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                    isActive
                        ? "bg-gray-700 text-gray-200"
                        : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                )}
            >
                {label}
                {isActive && (
                    <span className="ml-0.5">{current.dir === 'desc' ? '↓' : '↑'}</span>
                )}
            </button>
        );
    };

    const isBuiltInSelected = selectedStrategy === "rsi_cci_wt";

    return (
        <>
            <Button
                variant="secondary"
                className={cn(
                    "search-btn",
                    isActive && "border-yellow-500/60 text-yellow-400"
                )}
                onClick={openDialog}
            >
                <Target className="w-3.5 h-3.5 mr-1.5 opacity-60" />
                Strategies
                {isActive && (
                    <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />
                )}
            </Button>

            <TAGlassDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                title="Strategies"
                icon={<Target className="w-4 h-4 text-yellow-400" />}
                width="max-w-2xl"
                footer={
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400 truncate mr-2">
                            {getSelectionLabel()}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                            {isActive && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs text-red-400 border-red-500/30 hover:bg-red-500/10 transition-all"
                                    onClick={clearStrategyFromURL}
                                >
                                    Remove Strategy
                                </Button>
                            )}
                            {selectedStrategy && (
                                <>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-xs text-gray-400 hover:text-gray-200"
                                        onClick={() => setSelectedStrategy("")}
                                    >
                                        Clear
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        className="text-xs font-medium
                                            bg-yellow-100 border border-yellow-400/30 text-yellow-700
                                            hover:bg-yellow-200 transition-all"
                                        onClick={applyStrategy}
                                    >
                                        <Check className="w-3.5 h-3.5 mr-1" />
                                        Apply
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                }
            >
                {/* ═══════════════════════════════════════════════════════════════
                   1. BUILT-IN STRATEGIES
                   ═══════════════════════════════════════════════════════════════ */}
                <div className="mb-5">
                    <div className="flex items-center gap-1.5 mb-2">
                        <Shield className="w-3 h-3 text-yellow-400" />
                        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                            Built-in
                        </span>
                    </div>
                    {BUILT_IN_STRATEGIES.map((s) => {
                        const isSelected = selectedStrategy === s.key;
                        return (
                            <button
                                key={s.key}
                                onClick={() => toggleStrategy(s.key)}
                                className={cn(
                                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg",
                                    "transition-all duration-150 text-left",
                                    isSelected
                                        ? "bg-yellow-500/10 border border-yellow-500/30"
                                        : "hover:bg-white/5 border border-transparent"
                                )}
                            >
                                <div
                                    className={cn(
                                        "w-8 h-8 rounded-lg flex items-center justify-center text-xs shrink-0",
                                        isSelected
                                            ? "bg-yellow-500/10 text-yellow-400"
                                            : "bg-gray-800 text-gray-400"
                                    )}
                                >
                                    <Sparkles className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span
                                            className={cn(
                                                "text-sm font-medium",
                                                isSelected
                                                    ? "text-yellow-400"
                                                    : "text-gray-200"
                                            )}
                                        >
                                            {s.label}
                                        </span>
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
                                            Recommended
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-gray-400 mt-0.5">
                                        {s.description}
                                    </div>
                                </div>
                                <div
                                    className={cn(
                                        "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                                        isSelected
                                            ? "border-yellow-500"
                                            : "border-gray-600"
                                    )}
                                >
                                    {isSelected && (
                                        <div className="w-2 h-2 rounded-full bg-yellow-500" />
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* ═══════════════════════════════════════════════════════════════
                   2. MY STRATEGIES (isDiscovered: false)
                   ═══════════════════════════════════════════════════════════════ */}
                <div className="mb-5">
                    <div className="flex items-center gap-1.5 mb-2">
                        <Users className="w-3 h-3 text-emerald-400" />
                        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                            My Strategies
                        </span>
                        <span className="text-[10px] text-gray-500 ml-auto">
                            {myStrategies.length}
                        </span>
                    </div>

                    {/* Sort bar */}
                    <div className="flex items-center gap-1 mb-2 px-1">
                        <ArrowUpDown className="w-2.5 h-2.5 text-gray-600" />
                        {SORT_OPTIONS.map(opt => (
                            <SortButton key={opt.value} section="my" field={opt.value} label={opt.label} />
                        ))}
                    </div>

                    {loadingSaved ? (
                        <div className="flex items-center justify-center py-6">
                            <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                        </div>
                    ) : myStrategies.length === 0 ? (
                        <div className="text-center py-4 bg-gray-800/50 rounded-lg border border-dashed border-gray-700">
                            <p className="text-xs text-gray-400 mb-2">
                                No custom strategies yet
                            </p>
                            <button
                                onClick={() => {
                                    setDialogOpen(false);
                                    setTimeout(() => setModalOpen(true), 200);
                                }}
                                className="text-xs text-emerald-400 hover:text-emerald-300
                                    bg-emerald-500/10 border border-emerald-500/30
                                    px-3 py-1.5 rounded-lg transition-colors inline-flex items-center gap-1"
                            >
                                <Plus className="w-3 h-3" />
                                Create your first strategy
                            </button>
                        </div>
                    ) : (
                        <div className="max-h-[240px] overflow-y-auto space-y-0.5
                            scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent pr-1">
                            {myStrategies.map((item) => {
                                const key = getStrategyKey(item.id);
                                const isSelected = selectedStrategy === key;
                                const isTogglingPin = togglingPin.has(item.id);
                                const isDeleting = deletingStrategy.has(item.id);
                                const indLabels = item.indicators
                                    .map(k => INDICATOR_DETAILS.find(i => i.key === k)?.label ?? k)
                                    .join(" + ");

                                return (
                                    <div
                                        key={item.id}
                                        className={cn(
                                            "flex items-center gap-1.5 px-2.5 py-2 rounded-lg",
                                            "transition-all duration-150 group",
                                            isSelected
                                                ? "bg-emerald-500/10 border border-emerald-500/30"
                                                : "hover:bg-white/5 border border-transparent"
                                        )}
                                    >
                                        {/* Radio select */}
                                        <button
                                            onClick={() => toggleStrategy(key)}
                                            className="flex-1 flex items-center gap-2 min-w-0"
                                        >
                                            <div
                                                className={cn(
                                                    "w-7 h-7 rounded-md flex items-center justify-center text-xs shrink-0",
                                                    isSelected
                                                        ? "bg-emerald-500/10 text-emerald-400"
                                                        : "bg-gray-800 text-gray-400"
                                                )}
                                            >
                                                <Target className="w-3.5 h-3.5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                {/* Inline rename */}
                                                {renameTarget === item.id ? (
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            type="text"
                                                            value={renameValue}
                                                            onChange={(e) => setRenameValue(e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') confirmRename(e);
                                                                if (e.key === 'Escape') cancelRename();
                                                            }}
                                                            className="w-full bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-sm text-gray-100 outline-none focus:border-emerald-500"
                                                            autoFocus
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                        {renamingStrategy === item.id ? (
                                                            <Loader2 className="w-3 h-3 text-gray-400 animate-spin shrink-0" />
                                                        ) : (
                                                            <>
                                                                <button
                                                                    onClick={confirmRename}
                                                                    className="p-0.5 text-emerald-400 hover:text-emerald-300 shrink-0"
                                                                >
                                                                    <Check className="w-3 h-3" />
                                                                </button>
                                                                <button
                                                                    onClick={cancelRename}
                                                                    className="p-0.5 text-gray-500 hover:text-gray-300 shrink-0"
                                                                >
                                                                    <X className="w-3 h-3" />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="flex items-center gap-1.5">
                                                            {item.pinned && (
                                                                <Pin className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                                                            )}
                                                            <span
                                                                className={cn(
                                                                    "text-sm font-medium truncate",
                                                                    isSelected
                                                                        ? "text-emerald-400"
                                                                        : "text-gray-200"
                                                                )}
                                                            >
                                                                {item.name}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                                                            <span className="truncate">{indLabels}</span>
                                                            <span className="text-gray-600">·</span>
                                                            <span>
                                                                {item.mode === "majority" ? "Majority" : "All must agree"}
                                                            </span>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                            <div
                                                className={cn(
                                                    "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                                                    isSelected
                                                        ? "border-emerald-500"
                                                        : "border-gray-600"
                                                )}
                                            >
                                                {isSelected && (
                                                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                                )}
                                            </div>
                                        </button>

                                        {/* Action buttons */}
                                        {renameTarget !== item.id && (
                                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                {/* Pin */}
                                                <button
                                                    onClick={(e) => handleTogglePin(e, item.id)}
                                                    disabled={isTogglingPin}
                                                    className={cn(
                                                        "w-6 h-6 flex items-center justify-center rounded-md transition-all",
                                                        item.pinned
                                                            ? "text-emerald-400 hover:bg-emerald-500/10"
                                                            : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                                                    )}
                                                >
                                                    {isTogglingPin ? (
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                    ) : item.pinned ? (
                                                        <Pin className="w-3 h-3" />
                                                    ) : (
                                                        <PinOff className="w-3 h-3" />
                                                    )}
                                                </button>
                                                {/* Rename */}
                                                <button
                                                    onClick={(e) => startRename(e, item)}
                                                    className="w-6 h-6 flex items-center justify-center rounded-md
                                                        text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
                                                >
                                                    <Edit3 className="w-3 h-3" />
                                                </button>
                                                {/* Delete */}
                                                {isDeleting ? (
                                                    <Loader2 className="w-3 h-3 text-gray-500 animate-spin mx-1.5" />
                                                ) : (
                                                    <button
                                                        onClick={(e) => handleDelete(item, e)}
                                                        className="w-6 h-6 flex items-center justify-center rounded-md
                                                            text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ═══════════════════════════════════════════════════════════════
                   3. DISCOVERED STRATEGIES (isDiscovered: true)
                   ═══════════════════════════════════════════════════════════════ */}
                <div className="mb-3">
                    <div className="flex items-center gap-1.5 mb-2">
                        <Lightbulb className="w-3 h-3 text-violet-400" />
                        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                            Discovered Strategies
                        </span>
                        <span className="text-[10px] text-gray-500 ml-auto">
                            {discoveredStrategies.length}
                        </span>
                    </div>

                    {/* Sort bar */}
                    <div className="flex items-center gap-1 mb-2 px-1">
                        <ArrowUpDown className="w-2.5 h-2.5 text-gray-600" />
                        {SORT_OPTIONS.map(opt => (
                            <SortButton key={opt.value} section="discovered" field={opt.value} label={opt.label} />
                        ))}
                    </div>

                    {loadingSaved ? (
                        <div className="flex items-center justify-center py-6">
                            <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                        </div>
                    ) : discoveredStrategies.length === 0 ? (
                        <div className="text-center py-4 bg-gray-800/50 rounded-lg border border-dashed border-gray-700">
                            <p className="text-xs text-gray-400">
                                No discovered strategies yet
                            </p>
                            <p className="text-[10px] text-gray-500 mt-1">
                                Run a Deep Discovery from Archive and import results here
                            </p>
                        </div>
                    ) : (
                        <div className="max-h-[240px] overflow-y-auto space-y-0.5
                            scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent pr-1">
                            {discoveredStrategies.map((item) => {
                                const key = getStrategyKey(item.id);
                                const isSelected = selectedStrategy === key;
                                const isTogglingPin = togglingPin.has(item.id);
                                const isDeleting = deletingStrategy.has(item.id);
                                const indLabels = item.indicators
                                    .map(k => INDICATOR_DETAILS.find(i => i.key === k)?.label ?? k.toUpperCase())
                                    .join(" + ");

                                return (
                                    <div
                                        key={item.id}
                                        className={cn(
                                            "flex items-center gap-1.5 px-2.5 py-2 rounded-lg",
                                            "transition-all duration-150 group",
                                            isSelected
                                                ? "bg-violet-500/10 border border-violet-500/30"
                                                : "hover:bg-white/5 border border-transparent"
                                        )}
                                    >
                                        {/* Radio select */}
                                        <button
                                            onClick={() => toggleStrategy(key)}
                                            className="flex-1 flex items-center gap-2 min-w-0"
                                        >
                                            <div
                                                className={cn(
                                                    "w-7 h-7 rounded-md flex items-center justify-center text-xs shrink-0",
                                                    isSelected
                                                        ? "bg-violet-500/10 text-violet-400"
                                                        : "bg-gray-800 text-gray-400"
                                                )}
                                            >
                                                <Sparkles className="w-3.5 h-3.5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                {/* Inline rename */}
                                                {renameTarget === item.id ? (
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            type="text"
                                                            value={renameValue}
                                                            onChange={(e) => setRenameValue(e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') confirmRename(e);
                                                                if (e.key === 'Escape') cancelRename();
                                                            }}
                                                            className="w-full bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-sm text-gray-100 outline-none focus:border-violet-500"
                                                            autoFocus
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                        {renamingStrategy === item.id ? (
                                                            <Loader2 className="w-3 h-3 text-gray-400 animate-spin shrink-0" />
                                                        ) : (
                                                            <>
                                                                <button
                                                                    onClick={confirmRename}
                                                                    className="p-0.5 text-emerald-400 hover:text-emerald-300 shrink-0"
                                                                >
                                                                    <Check className="w-3 h-3" />
                                                                </button>
                                                                <button
                                                                    onClick={cancelRename}
                                                                    className="p-0.5 text-gray-500 hover:text-gray-300 shrink-0"
                                                                >
                                                                    <X className="w-3 h-3" />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="flex items-center gap-1.5">
                                                            {item.pinned && (
                                                                <Pin className="w-2.5 h-2.5 text-violet-400 shrink-0" />
                                                            )}
                                                            <span
                                                                className={cn(
                                                                    "text-sm font-medium truncate",
                                                                    isSelected
                                                                        ? "text-violet-400"
                                                                        : "text-gray-200"
                                                                )}
                                                            >
                                                                {item.name}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5 flex-wrap">
                                                            <span className="truncate">{indLabels}</span>
                                                            {item.discoveredWinRate != null && (
                                                                <>
                                                                    <span className="text-gray-600">·</span>
                                                                    <span className="text-amber-400 font-medium">
                                                                        WR: {item.discoveredWinRate.toFixed(1)}%
                                                                    </span>
                                                                </>
                                                            )}
                                                            {item.discoveredSharpeRatio != null && (
                                                                <>
                                                                    <span className="text-gray-600">·</span>
                                                                    <span className={cn(
                                                                        item.discoveredSharpeRatio >= 1.5
                                                                            ? "text-emerald-400"
                                                                            : item.discoveredSharpeRatio >= 0.5
                                                                                ? "text-yellow-400"
                                                                                : "text-red-400"
                                                                    )}>
                                                                        SR: {item.discoveredSharpeRatio.toFixed(2)}
                                                                    </span>
                                                                </>
                                                            )}
                                                            {item.discoveredProfitFactor != null && (
                                                                <>
                                                                    <span className="text-gray-600">·</span>
                                                                    <span className={cn(
                                                                        item.discoveredProfitFactor >= 2.0
                                                                            ? "text-emerald-400"
                                                                            : item.discoveredProfitFactor >= 1.2
                                                                                ? "text-yellow-400"
                                                                                : "text-red-400"
                                                                    )}>
                                                                        PF: {item.discoveredProfitFactor.toFixed(2)}
                                                                    </span>
                                                                </>
                                                            )}
                                                            {item.discoveredTotalSignals != null && (
                                                                <>
                                                                    <span className="text-gray-600">·</span>
                                                                    <span className="text-gray-400">
                                                                        Sig: {item.discoveredTotalSignals}
                                                                    </span>
                                                                </>
                                                            )}
                                                            {item.discoveredSymbol && (
                                                                <>
                                                                    <span className="text-gray-600">·</span>
                                                                    <span className="text-gray-500">
                                                                        {item.discoveredSymbol}
                                                                    </span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                            <div
                                                className={cn(
                                                    "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                                                    isSelected
                                                        ? "border-violet-500"
                                                        : "border-gray-600"
                                                )}
                                            >
                                                {isSelected && (
                                                    <div className="w-2 h-2 rounded-full bg-violet-500" />
                                                )}
                                            </div>
                                        </button>

                                        {/* Action buttons */}
                                        {renameTarget !== item.id && (
                                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                {/* Pin */}
                                                <button
                                                    onClick={(e) => handleTogglePin(e, item.id)}
                                                    disabled={isTogglingPin}
                                                    className={cn(
                                                        "w-6 h-6 flex items-center justify-center rounded-md transition-all",
                                                        item.pinned
                                                            ? "text-violet-400 hover:bg-violet-500/10"
                                                            : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                                                    )}
                                                >
                                                    {isTogglingPin ? (
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                    ) : item.pinned ? (
                                                        <Pin className="w-3 h-3" />
                                                    ) : (
                                                        <PinOff className="w-3 h-3" />
                                                    )}
                                                </button>
                                                {/* Rename */}
                                                <button
                                                    onClick={(e) => startRename(e, item)}
                                                    className="w-6 h-6 flex items-center justify-center rounded-md
                                                        text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
                                                >
                                                    <Edit3 className="w-3 h-3" />
                                                </button>
                                                {/* Delete */}
                                                {isDeleting ? (
                                                    <Loader2 className="w-3 h-3 text-gray-500 animate-spin mx-1.5" />
                                                ) : (
                                                    <button
                                                        onClick={(e) => handleDelete(item, e)}
                                                        className="w-6 h-6 flex items-center justify-center rounded-md
                                                            text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── Action Buttons ── */}
                <div className="flex items-center gap-2 mt-2">
                    <button
                        onClick={() => {
                            setDialogOpen(false);
                            const params = new URLSearchParams(searchParams.toString());
                            if (searchParams.get("telemetry") === "1") {
                                params.delete("telemetry");
                            } else {
                                params.set("telemetry", "1");
                            }
                            router.replace(`${pathname}?${params.toString()}`, { scroll: false });
                        }}
                        disabled={!candles || candles.length === 0}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm
                            text-violet-400 hover:text-violet-300
                            bg-violet-500/10 hover:bg-violet-500/20
                            border border-dashed border-violet-500/30 hover:border-violet-500/50
                            rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <BarChart3 className="w-4 h-4" />
                        <span className="font-medium">Market Telemetry</span>
                    </button>
                    <button
                        onClick={() => {
                            setDialogOpen(false);
                            setTimeout(() => setDiscoveryOpen(true), 200);
                        }}
                        disabled={!candles || candles.length === 0 || !allData}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm
                            text-amber-400 hover:text-amber-300
                            bg-amber-500/10 hover:bg-amber-500/20
                            border border-dashed border-amber-500/30 hover:border-amber-500/50
                            rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Lightbulb className="w-4 h-4" />
                        <span className="font-medium">Discover Strategy</span>
                    </button>
                    <button
                        onClick={() => {
                            setDialogOpen(false);
                            setTimeout(() => setModalOpen(true), 200);
                        }}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm
                            text-emerald-400 hover:text-emerald-300
                            bg-emerald-500/10 hover:bg-emerald-500/20
                            border border-dashed border-emerald-500/30 hover:border-emerald-500/50
                            rounded-lg transition-all"
                    >
                        <Plus className="w-4 h-4" />
                        <span className="font-medium">Create Strategy</span>
                    </button>
                </div>
            </TAGlassDialog>

            {/* Strategy Discovery Dialog */}
            {candles && allData && (
                <StrategyDiscoveryDialog
                    candles={candles}
                    allData={allData}
                    symbol={symbol}
                    interval={interval as any}
                    userId={userId}
                    onApply={handleDiscoveryApply}
                    open={discoveryOpen}
                    onOpenChange={setDiscoveryOpen}
                />
            )}

            {/* Create Strategy Modal */}
            <CustomStrategyModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onCreated={handleCreated}
                userId={userId}
            />

            {/* Delete Confirmation Dialog */}
            {deleteTarget && (
                <DeleteConfirmDialog
                    strategyName={deleteTarget.name}
                    onConfirm={confirmDelete}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}
        </>
    );
};

export default TAStrategiesButton;
