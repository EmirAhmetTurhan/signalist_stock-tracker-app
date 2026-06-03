"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, Plus, CheckCircle2, Circle, ChevronRight, Trash2, AlertCircle, Users, Shield, Database, Loader2, BarChart3 } from "lucide-react";
import type { StrategyMode } from '@/lib/ta/types';
import { getSavedStrategies, deleteSavedStrategy } from '@/lib/actions/saved-strategy.actions';

// ─── Tip Tanımları ──────────────────────────────────────────────────────────
export interface CustomStrategy {
    key: string;           // "custom_1714000000000" or "saved_mongoId"
    name: string;          // "Benim Stratejim"
    indicators: string[];  // ["rsi", "cci", "macd"]
    createdAt: number;
    mode?: StrategyMode;   // 'all' | 'majority', varsayılan 'all'
    lookForward?: number;  // varsayılan 14
    /** Per-indicator optimized params from discovery/optimization, e.g. { rsi_len: 7, cci_len: 14 } */
    params?: Record<string, number>;
    /** Win rate from the discovery/optimization result (for display when params are set) */
    discoveryWinRate?: number;
    /** Signal count from the discovery/optimization result */
    discoverySignalCount?: number;
}

// ─── Desteklenen Indicators ────────────────────────────────────────────────
export const AVAILABLE_INDICATORS = [
    {
        key: "rsi",
        label: "RSI",
        full: "Relative Strength Index",
        description: "RSI > MA → AL (< 62), RSI < MA → SAT (> 38)",
        color: "#a78bfa",
    },
    {
        key: "cci",
        label: "CCI",
        full: "Commodity Channel Index",
        description: "CCI > 0 → AL, CCI < 0 → SAT (sıfır çizgisi bazlı)",
        color: "#34d399",
    },
    {
        key: "wavetrend",
        label: "WaveTrend",
        full: "WaveTrend Oscillator",
        description: "WT1 > WT2 ve < 55 → AL, WT1 < WT2 ve > -55 → SAT",
        color: "#60a5fa",
    },
    {
        key: "macd",
        label: "MACD",
        full: "Moving Average Convergence Divergence",
        description: "MACD > Signal → AL, MACD < Signal → SAT",
        color: "#f59e0b",
    },
    {
        key: "stochrsi",
        label: "StochRSI",
        full: "Stochastic RSI",
        description: "K > D ve < 80 → AL, K < D ve > 20 → SAT",
        color: "#f472b6",
    },
    {
        key: "dmi",
        label: "DMI",
        full: "Directional Movement Index",
        description: "+DI > -DI ve ADX > 20 → AL, -DI > +DI → SAT",
        color: "#fb923c",
    },
    {
        key: "smi",
        label: "SMI",
        full: "Stochastic Momentum Index",
        description: "SMI > Signal → AL, SMI < Signal → SAT",
        color: "#2dd4bf",
    },
    {
        key: "ao",
        label: "AO",
        full: "Awesome Oscillator",
        description: "AO > 0 ve yükseliyor → AL, AO < 0 ve düşüyor → SAT",
        color: "#818cf8",
    },
    {
        key: "mfi",
        label: "MFI",
        full: "Money Flow Index",
        description: "MFI < 20 → AL (aşırı satış), MFI > 80 → SAT (aşırı alım)",
        color: "#4ade80",
    },
    {
        key: "wpr",
        label: "WPR",
        full: "Williams %R",
        description: "WPR < -80 → AL (oversold), WPR > -20 → SAT (overbought)",
        color: "#c084fc",
    },
    {
        key: "di",
        label: "DI",
        full: "Demand Index",
        description: "DI > 0 ve artıyor → AL, DI < 0 ve azalıyor → SAT",
        color: "#38bdf8",
    },
    {
        key: "cmf",
        label: "CMF",
        full: "Chaikin Money Flow",
        description: "CMF > 0.05 → AL (para girişi), CMF < -0.05 → SAT",
        color: "#fb7185",
    },
    {
        key: "ad",
        label: "A/D",
        full: "Accumulation / Distribution",
        description: "A/D SMA'yı yukarı kesiyor → AL, aşağı kesiyor → SAT",
        color: "#fbbf24",
    },
    {
        key: "netvol",
        label: "NetVol",
        full: "Net Volume",
        description: "Net hacim > 0 ve artıyor → AL, < 0 ve azalıyor → SAT",
        color: "#a3e635",
    },
    {
        key: "madr",
        label: "MADR",
        full: "Moving Average Distance Ratio",
        description: "MADR 0'ı yukarı kesiyor → AL, aşağı kesiyor → SAT",
        color: "#e879f9",
    },
    {
        key: "alma",
        label: "ALMA",
        full: "Arnaud Legoux Moving Average",
        description: "Fiyat ALMA'yı yukarı kesiyor → AL, aşağı kesiyor → SAT",
        color: "#fbbf24",
    },
    {
        key: "bb",
        label: "BB",
        full: "Bollinger Bantları",
        description: "Fiyat Alt Bandı yukarı kesiyor → AL, Üst Bandı aşağı kesiyor → SAT",
        color: "#3b82f6",
    },
] as const;

export type IndicatorKey = typeof AVAILABLE_INDICATORS[number]["key"];

// ─── LocalStorage Yardımcıları ───────────────────────────────────────────────
const STORAGE_KEY = "signalist_custom_strategies";

export function loadCustomStrategies(): CustomStrategy[] {
    if (typeof window === "undefined") return [];
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
        return [];
    }
}

export function saveCustomStrategies(strategies: CustomStrategy[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(strategies));
}

// ─── Tip: Saved Strategy from MongoDB ──────────────────────────────────────
interface SavedStrategyItem {
    id: string;
    name: string;
    indicators: string[];
    mode: StrategyMode;
    lookForward: number;
    discoveredWinRate?: number | null;
    createdAt: string | null;
}

// ─── Modal Bileşeni ──────────────────────────────────────────────────────────
interface CustomStrategyModalProps {
    open: boolean;
    onClose: () => void;
    onCreated: (strategy: CustomStrategy) => void;
    userId?: string;
}

type ModalTab = 'create' | 'saved';

export default function CustomStrategyModal({ open, onClose, onCreated, userId }: CustomStrategyModalProps) {
    const [tab, setTab] = useState<ModalTab>('create');
    const [name, setName] = useState("");
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [error, setError] = useState("");
    const [mode, setMode] = useState<StrategyMode>('all');
    const [lookForward, setLookForward] = useState(14);
    const [animateIn, setAnimateIn] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Saved strategies state
    const [savedStrategies, setSavedStrategies] = useState<SavedStrategyItem[]>([]);
    const [loadingSaved, setLoadingSaved] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setName("");
            setSelected(new Set());
            setError("");
            setTab('create');
            setDeleteConfirm(null);
            setTimeout(() => {
                setAnimateIn(true);
                inputRef.current?.focus();
            }, 10);
        } else {
            setAnimateIn(false);
        }
    }, [open]);

    // Load saved strategies when switching to saved tab
    useEffect(() => {
        if (open && tab === 'saved' && userId) {
            setLoadingSaved(true);
            getSavedStrategies(userId).then(res => {
                if (res.success) {
                    setSavedStrategies(res.data as SavedStrategyItem[]);
                }
                setLoadingSaved(false);
            }).catch(() => setLoadingSaved(false));
        }
    }, [open, tab, userId]);

    const toggle = (key: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
        setError("");
    };

    const handleCreate = () => {
        const trimmed = name.trim();
        if (!trimmed) { setError("Strategy name is required."); return; }
        if (selected.size < 2) { setError("Select at least 2 indicators."); return; }

        const strategy: CustomStrategy = {
            key: `custom_${Date.now()}`,
            name: trimmed,
            indicators: Array.from(selected),
            createdAt: Date.now(),
            mode,
            lookForward,
        };

        const existing = loadCustomStrategies();
        saveCustomStrategies([...existing, strategy]);
        onCreated(strategy);
        onClose();
    };

    const handleLoadSaved = useCallback((item: SavedStrategyItem) => {
        const strategy: CustomStrategy = {
            key: `saved_${item.id}`,
            name: item.name,
            indicators: item.indicators,
            createdAt: item.createdAt ? new Date(item.createdAt).getTime() : Date.now(),
            mode: item.mode,
            lookForward: item.lookForward,
        };
        onCreated(strategy);
        onClose();
    }, [onCreated, onClose]);

    const handleDeleteSaved = useCallback(async (id: string) => {
        if (!userId) return;
        setDeleteConfirm(id);
    }, [userId]);

    const confirmDelete = useCallback(async () => {
        if (!userId || !deleteConfirm) return;
        const res = await deleteSavedStrategy(userId, deleteConfirm);
        if (res.success) {
            setSavedStrategies(prev => prev.filter(s => s.id !== deleteConfirm));
        }
        setDeleteConfirm(null);
    }, [userId, deleteConfirm]);

    if (!open) return null;

    return (
        <>
            {/* Overlay */}
            <div
                className="fixed inset-0 z-50 flex items-center justify-center"
                onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            >
                {/* Backdrop */}
                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

                {/* Panel */}
                <div
                    className={`relative z-10 w-full max-w-lg mx-4 rounded-2xl border border-violet-800/60
                        bg-gradient-to-br from-[#13101f] via-[#0f0d1a] to-[#0a0814]
                        shadow-[0_0_60px_rgba(139,92,246,0.15)]
                        flex flex-col max-h-[90vh]
                        transition-all duration-300
                        ${animateIn ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}
                >
                    {/* Header — sabit */}
                    <div className="flex-shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b border-violet-900/40">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
                                <Plus className="w-4 h-4 text-violet-400" />
                            </div>
                            <div>
                                <h2 className="text-sm font-semibold text-violet-100">Strategies</h2>
                                <p className="text-[11px] text-gray-500">Create or load a strategy</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-200 hover:bg-white/5 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Tab switcher */}
                    <div className="flex-shrink-0 flex border-b border-violet-900/30 px-6 pt-2 gap-4">
                        <button
                            onClick={() => setTab('create')}
                            className={`pb-2 text-xs font-medium transition-colors border-b-2 ${tab === 'create'
                                ? 'text-violet-300 border-violet-500'
                                : 'text-gray-500 border-transparent hover:text-gray-300'
                                }`}
                        >
                            <Plus className="w-3 h-3 inline mr-1" />
                            Create New
                        </button>
                        <button
                            onClick={() => setTab('saved')}
                            className={`pb-2 text-xs font-medium transition-colors border-b-2 ${tab === 'saved'
                                ? 'text-violet-300 border-violet-500'
                                : 'text-gray-500 border-transparent hover:text-gray-300'
                                }`}
                        >
                            <Database className="w-3 h-3 inline mr-1" />
                            Saved Strategies
                            {savedStrategies.length > 0 && (
                                <span className="ml-1.5 text-[10px] bg-violet-900/40 text-violet-300 px-1.5 py-0.5 rounded-full">
                                    {savedStrategies.length}
                                </span>
                            )}
                        </button>
                    </div>

                    {/* Body — kaydırılabilir */}
                    {tab === 'create' ? (
                        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                            {/* Name input */}
                            <div>
                                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">
                                    Strategy Name
                                </label>
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={name}
                                    onChange={e => { setName(e.target.value); setError(""); }}
                                    onKeyDown={e => { if (e.key === "Enter") handleCreate(); }}
                                    placeholder="örn: RSI + MACD Combo"
                                    maxLength={40}
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10
                                        text-sm text-gray-100 placeholder-gray-600
                                        focus:outline-none focus:border-violet-500/60 focus:bg-violet-950/20
                                        transition-all"
                                />
                            </div>

                            {/* Mode + LookForward ayarları */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Mode seçici */}
                                <div>
                                    <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">
                                        Decision Mode
                                    </label>
                                    <div className="flex rounded-xl overflow-hidden border border-white/10">
                                        <button
                                            onClick={() => setMode('all')}
                                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-all
                                                ${mode === 'all'
                                                    ? 'bg-violet-600/40 text-violet-200 border-r border-white/10'
                                                    : 'bg-white/5 text-gray-500 hover:bg-white/[0.08]'}`}
                                        >
                                            <Shield className="w-3.5 h-3.5" />
                                            All Agree
                                        </button>
                                        <button
                                            onClick={() => setMode('majority')}
                                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-all
                                                ${mode === 'majority'
                                                    ? 'bg-violet-600/40 text-violet-200 border-l border-white/10'
                                                    : 'bg-white/5 text-gray-500 hover:bg-white/[0.08]'}`}
                                        >
                                            <Users className="w-3.5 h-3.5" />
                                            Majority
                                        </button>
                                    </div>
                                </div>

                                {/* LookForward input */}
                                <div>
                                    <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">
                                        Look-ahead (bars)
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={60}
                                        value={lookForward}
                                        onChange={e => setLookForward(Math.max(1, Math.min(60, Number(e.target.value) || 14)))}
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10
                                            text-sm text-gray-100 placeholder-gray-600
                                            focus:outline-none focus:border-violet-500/60 focus:bg-violet-950/20
                                            transition-all"
                                    />
                                </div>
                            </div>

                            {/* Indicator picker */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                                        Indicators
                                    </label>
                                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${selected.size >= 2
                                        ? "bg-violet-900/30 text-violet-300 border-violet-700/50"
                                        : "bg-gray-800/60 text-gray-500 border-gray-700/50"
                                        }`}>
                                        {selected.size} / {AVAILABLE_INDICATORS.length} selected
                                    </span>
                                </div>
                                <div className="grid grid-cols-1 gap-1.5">
                                    {AVAILABLE_INDICATORS.map(ind => {
                                        const isSelected = selected.has(ind.key);
                                        return (
                                            <button
                                                key={ind.key}
                                                onClick={() => toggle(ind.key)}
                                                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-left
                                                    transition-all duration-150
                                                    ${isSelected
                                                        ? "bg-violet-950/40 border-violet-600/50 shadow-[0_0_12px_rgba(139,92,246,0.1)]"
                                                        : "bg-white/[0.03] border-white/8 hover:bg-white/[0.06] hover:border-white/12"
                                                    }`}
                                            >
                                                {/* Check icon */}
                                                <div className="flex-shrink-0">
                                                    {isSelected
                                                        ? <CheckCircle2 className="w-4 h-4" style={{ color: ind.color }} />
                                                        : <Circle className="w-4 h-4 text-gray-600" />
                                                    }
                                                </div>

                                                {/* Label chip */}
                                                <span
                                                    className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                                                    style={{ backgroundColor: `${ind.color}20`, color: ind.color, border: `1px solid ${ind.color}40` }}
                                                >
                                                    {ind.label}
                                                </span>

                                                {/* Description */}
                                                <div className="min-w-0">
                                                    <div className="text-[12px] font-medium text-gray-200 truncate">{ind.full}</div>
                                                    <div className="text-[10px] text-gray-500 truncate">{ind.description}</div>
                                                </div>

                                                {/* Arrow */}
                                                {isSelected && <ChevronRight className="w-3.5 h-3.5 text-violet-400 ml-auto flex-shrink-0" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Error */}
                            {error && (
                                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-950/30 border border-red-800/40 text-red-400 text-xs">
                                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                    {error}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* ── Saved Strategies Tab ── */
                        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
                            {loadingSaved ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
                                    <span className="ml-2 text-xs text-gray-400">Loading saved strategies...</span>
                                </div>
                            ) : savedStrategies.length === 0 ? (
                                <div className="text-center py-8">
                                    <Database className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                                    <p className="text-[11px] text-gray-500">
                                        No saved strategies yet.<br />
                                        Run Strategy Discovery to auto-save top results.
                                    </p>
                                </div>
                            ) : (
                                savedStrategies.map(item => (
                                    <div
                                        key={item.id}
                                        className="bg-gray-900/50 border border-gray-800 rounded-xl p-3 hover:border-violet-700/40 transition-colors"
                                    >
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-medium text-gray-200 truncate">{item.name}</div>
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {item.indicators.map(key => {
                                                        const meta = AVAILABLE_INDICATORS.find(i => i.key === key);
                                                        return (
                                                            <span
                                                                key={key}
                                                                className="text-[9px] font-medium px-1.5 py-0.5 rounded-full border"
                                                                style={{
                                                                    backgroundColor: `${meta?.color ?? '#a78bfa'}15`,
                                                                    borderColor: `${meta?.color ?? '#a78bfa'}40`,
                                                                    color: meta?.color ?? '#a78bfa',
                                                                }}
                                                            >
                                                                {meta?.label ?? key.toUpperCase()}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            {/* Win rate badge */}
                                            {item.discoveredWinRate != null && (
                                                <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${item.discoveredWinRate >= 68
                                                    ? 'text-emerald-400 bg-emerald-900/20 border-emerald-700/40'
                                                    : item.discoveredWinRate >= 55
                                                        ? 'text-yellow-400 bg-yellow-900/20 border-yellow-700/40'
                                                        : 'text-red-400 bg-red-900/20 border-red-700/40'
                                                    }`}>
                                                    <BarChart3 className="w-2.5 h-2.5 inline mr-0.5" />
                                                    %{item.discoveredWinRate.toFixed(1)}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] text-gray-500 mb-2">
                                            <span>{item.mode === 'all' ? 'Unanimous' : 'Majority'}</span>
                                            <span>·</span>
                                            <span>Look-ahead: {item.lookForward}</span>
                                            {item.createdAt && (
                                                <>
                                                    <span>·</span>
                                                    <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                                                </>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleLoadSaved(item)}
                                                className="flex-1 text-[10px] bg-violet-600 hover:bg-violet-500 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
                                            >
                                                Load Strategy
                                            </button>
                                            <button
                                                onClick={() => handleDeleteSaved(item.id)}
                                                className="text-[10px] bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-800/40 font-medium px-3 py-1.5 rounded-lg transition-colors"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* Footer — sabit (only for create tab) */}
                    {tab === 'create' && (
                        <div className="flex-shrink-0 flex items-center justify-between px-6 pb-5 pt-3 gap-3 border-t border-violet-900/30">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={selected.size < 2 || !name.trim()}
                                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all
                                    ${selected.size >= 2 && name.trim()
                                        ? "bg-violet-600 hover:bg-violet-500 text-white shadow-[0_0_20px_rgba(139,92,246,0.3)]"
                                        : "bg-white/5 text-gray-600 cursor-not-allowed"
                                    }`}
                            >
                                <Plus className="w-4 h-4" />
                                Create Strategy
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Delete Confirmation Dialog */}
            {deleteConfirm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
                    <div className="relative z-10 w-80 mx-4 rounded-xl border border-red-900/50 bg-[#13101f] p-5 shadow-[0_0_40px_rgba(239,68,68,0.1)]">
                        <div className="flex items-center gap-2.5 mb-3">
                            <div className="w-8 h-8 rounded-lg bg-red-900/20 border border-red-800/40 flex items-center justify-center">
                                <Trash2 className="w-4 h-4 text-red-400" />
                            </div>
                            <div>
                                <div className="text-sm font-semibold text-red-200">Delete Strategy</div>
                                <div className="text-[11px] text-gray-500">This action cannot be undone</div>
                            </div>
                        </div>
                        <p className="text-xs text-gray-400 mb-4">
                            Are you sure you want to delete this saved strategy?
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1 px-3 py-2 rounded-lg text-xs text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors border border-white/8"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold text-red-200 bg-red-900/30 hover:bg-red-900/50 border border-red-800/40 transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// ─── Strateji Silme Onay Dialogu (legacy, kept for backward compatibility) ──
interface DeleteConfirmProps {
    strategyName: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export function DeleteConfirmDialog({ strategyName, onConfirm, onCancel }: DeleteConfirmProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative z-10 w-80 mx-4 rounded-xl border border-red-900/50 bg-[#13101f] p-5 shadow-[0_0_40px_rgba(239,68,68,0.1)]">
                <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-red-900/20 border border-red-800/40 flex items-center justify-center">
                        <Trash2 className="w-4 h-4 text-red-400" />
                    </div>
                    <div>
                        <div className="text-sm font-semibold text-red-200">Stratejiyi Sil</div>
                        <div className="text-[11px] text-gray-500">This action cannot be undone</div>
                    </div>
                </div>
                <p className="text-xs text-gray-400 mb-4">
                    <span className="text-gray-200 font-medium">"{strategyName}"</span> stratejisini silmek istediğinden emin misin?
                </p>
                <div className="flex gap-2">
                    <button onClick={onCancel} className="flex-1 px-3 py-2 rounded-lg text-xs text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors border border-white/8">
                        Cancel
                    </button>
                    <button onClick={onConfirm} className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold text-red-200 bg-red-900/30 hover:bg-red-900/50 border border-red-800/40 transition-colors">
                        Sil
                    </button>
                </div>
            </div>
        </div>
    );
}
