"use client";

import { Button } from "@/components/ui/button";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Target, Check } from "lucide-react";
import CustomStrategyModal, {
    DeleteConfirmDialog,
} from "@/components/panels/CustomStrategyModal";
import StrategyDiscoveryDialog from "@/components/panels/StrategyDiscoveryDialog";
import TAGlassDialog from "../common/TAGlassDialog";
import { cn } from "@/lib/utils";

import { useStrategyActions } from "@/components/strategies/hooks/useStrategyActions";
import { useStrategyURL } from "@/components/strategies/hooks/useStrategyURL";
import { SavedStrategyItem, SortConfig, SortField, TAStrategiesButtonProps } from "@/components/strategies/types";

import BuiltInStrategiesSection from "@/components/strategies/components/BuiltInStrategiesSection";
import MyStrategiesSection from "@/components/strategies/components/MyStrategiesSection";
import DiscoveredStrategiesSection from "@/components/strategies/components/DiscoveredStrategiesSection";
import StrategyActionButtons from "@/components/strategies/components/StrategyActionButtons";

// ─── Component ───────────────────────────────────────────────────────────────────

const TAStrategiesButton = ({ userId, candles, allData, interval, symbol }: TAStrategiesButtonProps) => {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const strategyParam = searchParams.get("strategy") || "";

    const {
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
        renameValue,
        setRenameValue,
        togglingPin,
        renamingStrategy,
        deletingStrategy,
        toggleStrategy,
        handleTogglePin,
        startRename,
        cancelRename,
        confirmRename,
        handleDelete,
        confirmDelete,
        handleCreated,
        handleDiscoveryApply,
    } = useStrategyActions({
        userId,
        router,
        pathname,
        searchParams,
    });

    // ── Sort config per section ───────────────────────────────────────────────
    const [mySort, setMySort] = useState<SortConfig>({ field: 'date', dir: 'desc' });
    const [discoveredSort, setDiscoveredSort] = useState<SortConfig>({ field: 'winRate', dir: 'desc' });

    // ── Select from URL param ─────────────────────────────────────────────────
    useEffect(() => {
        setSelectedStrategy(strategyParam);
    }, [strategyParam, setSelectedStrategy]);

    const openDialog = useCallback(() => {
        setSelectedStrategy(strategyParam);
        setDialogOpen(true);
    }, [strategyParam, setSelectedStrategy, setDialogOpen]);

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

    const {
        applyStrategy,
        clearStrategyFromURL,
        getSelectionLabel,
    } = useStrategyURL({
        router,
        pathname,
        searchParams,
        allStrategies,
        setDialogOpen,
    });

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

    const toggleSort = useCallback((section: 'my' | 'discovered', field: SortField) => {
        const setter = section === 'my' ? setMySort : setDiscoveredSort;
        const current = section === 'my' ? mySort : discoveredSort;
        if (current.field === field) {
            setter({ field, dir: current.dir === 'desc' ? 'asc' : 'desc' });
        } else {
            setter({ field, dir: 'desc' });
        }
    }, [mySort, discoveredSort]);

    const isActive = strategyParam !== "";

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
                disableBodyScroll={true}
                footer={
                    <div className="flex flex-col gap-3.5 w-full">
                        <StrategyActionButtons
                            candles={candles}
                            allData={allData}
                            onDiscoverClick={() => {
                                setDialogOpen(false);
                                setTimeout(() => setDiscoveryOpen(true), 200);
                            }}
                            onCreateClick={() => {
                                setDialogOpen(false);
                                setTimeout(() => setModalOpen(true), 200);
                            }}
                        />
                        <div className="flex items-center justify-between border-t border-white/10 pt-3">
                            <span className="text-xs text-gray-400 truncate mr-2">
                                {getSelectionLabel(selectedStrategy)}
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                                {isActive && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-xs text-red-400 border-red-500/30 hover:bg-red-500/10 transition-all"
                                        onClick={clearStrategyFromURL}
                                    >
                                        Clear Active Strategy
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
                                            onClick={() => applyStrategy(selectedStrategy)}
                                        >
                                            <Check className="w-3.5 h-3.5 mr-1" />
                                            Apply
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                }
            >
                <div className="space-y-4">
                    <BuiltInStrategiesSection
                        selectedStrategy={selectedStrategy}
                        onToggleStrategy={toggleStrategy}
                    />

                    <MyStrategiesSection
                        myStrategies={myStrategies}
                        loadingSaved={loadingSaved}
                        selectedStrategy={selectedStrategy}
                        onToggleStrategy={toggleStrategy}
                        onToggleSort={toggleSort}
                        currentSort={mySort}
                        togglingPin={togglingPin}
                        deletingStrategy={deletingStrategy}
                        renameTarget={renameTarget}
                        renameValue={renameValue}
                        setRenameValue={setRenameValue}
                        confirmRename={confirmRename}
                        cancelRename={cancelRename}
                        renamingStrategy={renamingStrategy}
                        handleTogglePin={handleTogglePin}
                        startRename={startRename}
                        handleDelete={handleDelete}
                        onCreateClick={() => {
                            setDialogOpen(false);
                            setTimeout(() => setModalOpen(true), 200);
                        }}
                    />

                    <DiscoveredStrategiesSection
                        discoveredStrategies={discoveredStrategies}
                        loadingSaved={loadingSaved}
                        selectedStrategy={selectedStrategy}
                        onToggleStrategy={toggleStrategy}
                        onToggleSort={toggleSort}
                        currentSort={discoveredSort}
                        togglingPin={togglingPin}
                        deletingStrategy={deletingStrategy}
                        renameTarget={renameTarget}
                        renameValue={renameValue}
                        setRenameValue={setRenameValue}
                        confirmRename={confirmRename}
                        cancelRename={cancelRename}
                        renamingStrategy={renamingStrategy}
                        handleTogglePin={handleTogglePin}
                        startRename={startRename}
                        handleDelete={handleDelete}
                    />
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
