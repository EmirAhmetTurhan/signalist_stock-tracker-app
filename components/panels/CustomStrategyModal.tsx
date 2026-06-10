"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, Plus, Database, Shield, Users, AlertCircle, Loader2 } from "lucide-react";
import type { StrategyMode } from '@/lib/ta/types';
import { getSavedStrategies, deleteSavedStrategy, createSavedStrategy } from '@/lib/actions/saved-strategy.actions';

// Re-export constants, helpers, and sub-components for strict backward compatibility
export { AVAILABLE_INDICATORS, loadCustomStrategies, saveCustomStrategies } from '@/components/strategies/constants';
export type { CustomStrategy } from '@/components/strategies/types';
export { default as DeleteConfirmDialog } from '@/components/strategies/components/DeleteConfirmDialog';

import { AVAILABLE_INDICATORS, loadCustomStrategies, saveCustomStrategies } from '@/components/strategies/constants';
import type { CustomStrategy, SavedStrategyItem } from '@/components/strategies/types';
import IndicatorSelector from '@/components/strategies/components/IndicatorSelector';
import SavedStrategiesList from '@/components/strategies/components/SavedStrategiesList';
import DeleteConfirmDialog from '@/components/strategies/components/DeleteConfirmDialog';

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
    
    // Look-ahead states: num is actual state, input is raw user typed text
    const [lookForward, setLookForward] = useState(14);
    const [lookForwardInput, setLookForwardInput] = useState("14");

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
            setLookForward(14);
            setLookForwardInput("14");
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

    // Bounded and non-locking onChange handler for Look-ahead input
    const handleLookForwardChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setLookForwardInput(val);
        if (val !== "") {
            const num = parseInt(val, 10);
            if (!isNaN(num)) {
                // Do not clamp immediately, just sync numerical value if it is valid
                setLookForward(num);
            }
        }
    };

    // Validates and bounds the value on blur (when typing is finished)
    const handleLookForwardBlur = () => {
        let num = parseInt(lookForwardInput, 10);
        if (isNaN(num) || num < 1) {
            num = 14;
        } else if (num > 60) {
            num = 60;
        }
        setLookForward(num);
        setLookForwardInput(num.toString());
    };

    const toggle = (key: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
        setError("");
    };

    const handleCreate = async () => {
        const trimmed = name.trim();
        if (!trimmed) { setError("Strategy name is required."); return; }
        if (selected.size < 2) { setError("Select at least 2 indicators."); return; }

        // Final input boundary fallback just in case
        let finalLookForward = lookForward;
        if (finalLookForward < 1 || finalLookForward > 60) {
            finalLookForward = 14;
        }

        if (userId) {
            const res = await createSavedStrategy({
                userId,
                name: trimmed,
                indicators: Array.from(selected),
                mode,
                lookForward: finalLookForward,
            });

            if (res.success && res.strategyId) {
                onCreated({
                    key: `saved_${res.strategyId}`,
                    name: trimmed,
                    indicators: Array.from(selected),
                    createdAt: Date.now(),
                    mode,
                    lookForward: finalLookForward,
                });
                onClose();
            } else {
                setError(res.error || "Failed to save strategy.");
            }
        } else {
            const strategy: CustomStrategy = {
                key: `custom_${Date.now()}`,
                name: trimmed,
                indicators: Array.from(selected),
                createdAt: Date.now(),
                mode,
                lookForward: finalLookForward,
            };

            const existing = loadCustomStrategies();
            saveCustomStrategies([strategy, ...existing]);
            onCreated(strategy);
            onClose();
        }
    };

    const handleLoadSaved = useCallback((item: SavedStrategyItem) => {
        const strategy: CustomStrategy = {
            key: `saved_${item.id}`,
            name: item.name,
            indicators: item.indicators,
            createdAt: item.createdAt ? new Date(item.createdAt).getTime() : Date.now(),
            mode: item.mode as StrategyMode,
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
                                            type="button"
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
                                            type="button"
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
                                        type="text"
                                        value={lookForwardInput}
                                        onChange={handleLookForwardChange}
                                        onBlur={handleLookForwardBlur}
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10
                                            text-sm text-gray-100 placeholder-gray-600
                                            focus:outline-none focus:border-violet-500/60 focus:bg-violet-950/20
                                            transition-all"
                                    />
                                </div>
                            </div>

                            {/* Indicator Selector component */}
                            <IndicatorSelector selected={selected} onToggle={toggle} />

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
                            <SavedStrategiesList
                                loading={loadingSaved}
                                savedStrategies={savedStrategies}
                                userId={userId}
                                onLoad={handleLoadSaved}
                                onDelete={handleDeleteSaved}
                            />
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
                <DeleteConfirmDialog
                    strategyName={savedStrategies.find(s => s.id === deleteConfirm)?.name || "selected strategy"}
                    onConfirm={confirmDelete}
                    onCancel={() => setDeleteConfirm(null)}
                />
            )}
        </>
    );
}
