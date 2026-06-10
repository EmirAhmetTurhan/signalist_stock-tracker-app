import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import type { CustomStrategy } from "../types";
import {
    loadCustomStrategies,
    saveCustomStrategies,
    AVAILABLE_INDICATORS,
} from "@/components/strategies/constants";
import {
    getSavedStrategies,
    togglePinStrategy,
    renameStrategy,
    deleteSavedStrategy,
} from "@/lib/actions/saved-strategy.actions";
import { SavedStrategyItem } from "../types";

export function getStrategyKey(id: string) {
    if (id.startsWith('custom_')) return id;
    return `saved_${id}`;
}

export function isSavedKey(key: string) {
    return key.startsWith('saved_') || key.startsWith('custom_');
}

export function parseSavedId(key: string) {
    if (key.startsWith('custom_')) return key;
    return key.replace('saved_', '');
}

interface UseStrategyActionsProps {
    userId?: string;
    router: any;
    pathname: string;
    searchParams: any;
}

export function useStrategyActions({
    userId,
    router,
    pathname,
    searchParams,
}: UseStrategyActionsProps) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [discoveryOpen, setDiscoveryOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<SavedStrategyItem | null>(null);
    const [selectedStrategy, setSelectedStrategy] = useState<string>("");

    const [savedStrategies, setSavedStrategies] = useState<SavedStrategyItem[]>([]);
    const [localStrategies, setLocalStrategies] = useState<CustomStrategy[]>([]);
    const [loadingSaved, setLoadingSaved] = useState(false);

    const [renameTarget, setRenameTarget] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");

    const [togglingPin, setTogglingPin] = useState<Set<string>>(new Set());
    const [renamingStrategy, setRenamingStrategy] = useState<string | null>(null);
    const [deletingStrategy, setDeletingStrategy] = useState<Set<string>>(new Set());

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
            console.error('[useStrategyActions] fetch error:', e);
        } finally {
            setLoadingSaved(false);
        }
    }, [userId]);

    useEffect(() => {
        fetchSaved();
    }, [fetchSaved]);

    const toggleStrategy = useCallback((key: string) => {
        setSelectedStrategy(prev => (prev === key ? "" : key));
    }, []);

    const handleTogglePin = useCallback(async (e: React.MouseEvent, strategyId: string) => {
        e.stopPropagation();
        e.preventDefault();
        if (!userId) {
            toast.error("User not authenticated");
            return;
        }
        if (togglingPin.has(strategyId)) return;
        setTogglingPin(prev => new Set(prev).add(strategyId));
        try {
            const res = await togglePinStrategy(userId, strategyId);
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
        if (!userId) {
            toast.error("User not authenticated");
            return;
        }
        if (!renameTarget || !renameValue.trim()) return;
        setRenamingStrategy(renameTarget);
        try {
            const res = await renameStrategy(userId, renameTarget, renameValue.trim());
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

        if (!userId) {
            toast.error("User not authenticated");
            return;
        }

        setDeletingStrategy(prev => new Set(prev).add(id));
        try {
            const res = await deleteSavedStrategy(userId, id);
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

    const handleCreated = useCallback((_strategy: CustomStrategy) => {
        fetchSaved();
        setSelectedStrategy(_strategy.key);

        const params = new URLSearchParams(searchParams.toString());
        params.set("strategy", _strategy.key);
        params.set("ind", _strategy.indicators.join(","));
        if (_strategy.params && Object.keys(_strategy.params).length > 0) {
            params.set("p", JSON.stringify(_strategy.params));
        } else {
            params.delete("p");
        }
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        router.refresh();
        setDialogOpen(false);
    }, [fetchSaved, searchParams, pathname, router]);

    const handleDiscoveryApply = useCallback((discovered: { indicators: string[]; params: Record<string, number>; winRate: number; totalSignals?: number }) => {
        const newStrategy: CustomStrategy = {
            key: `custom_${Date.now()}`,
            name: `Discovered — ${discovered.indicators.map((k: string) =>
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

        const params = new URLSearchParams(searchParams.toString());
        params.set("ind", discovered.indicators.join(","));
        if (discovered.params && Object.keys(discovered.params).length > 0) {
            params.set("p", JSON.stringify(discovered.params));
        }
        params.set("strategy", newStrategy.key);
        router.push(`${pathname}?${params.toString()}`);
        setDiscoveryOpen(false);
    }, [searchParams, pathname, router]);

    return {
        dialogOpen,
        setDialogOpen,
        modalOpen,
        setModalOpen,
        discoveryOpen,
        setDiscoveryOpen,
        deleteTarget,
        setDeleteTarget,
        selectedStrategy,
        setSelectedStrategy,
        savedStrategies,
        localStrategies,
        loadingSaved,
        renameTarget,
        setRenameTarget,
        renameValue,
        setRenameValue,
        togglingPin,
        renamingStrategy,
        deletingStrategy,
        fetchSaved,
        toggleStrategy,
        handleTogglePin,
        startRename,
        cancelRename,
        confirmRename,
        handleDelete,
        confirmDelete,
        handleCreated,
        handleDiscoveryApply,
    };
}
