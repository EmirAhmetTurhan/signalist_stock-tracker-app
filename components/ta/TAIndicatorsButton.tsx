"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PARAM_DEFAULTS_STR } from "@/lib/constants/indicator-params";
import {
    INDICATOR_DETAILS,
    CATEGORIES,
    getIndicatorInfo,
    getCategoryLabel,
} from "@/lib/constants/indicator-categories";
import TAGlassDialog from "./TAGlassDialog";
import { cn } from "@/lib/utils";
import {
    Search,
    Sparkles,
    Check,
    Layers,
    SlidersHorizontal,
    SortAsc,
    LayoutGrid,
} from "lucide-react";

// ─── Indicator Categories (grouped) ──────────────────────────────────────────

const groupedIndicators = CATEGORIES.map((cat) => ({
    ...cat,
    items: INDICATOR_DETAILS.filter((ind) => ind.category === cat.key),
})).filter((g) => g.items.length > 0);

type SortMode = "category" | "alphabetical";

// ─── Bileşen ──────────────────────────────────────────────────────────────────

const TAIndicatorsButton = () => {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const filtersRef = useRef<HTMLDivElement>(null);

    const symbol = searchParams.get("symbol") || "";
    const indParam = searchParams.get("ind") || "";

    const [dialogOpen, setDialogOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedIndicators, setSelectedIndicators] = useState<Set<string>>(new Set());
    const [sortMode, setSortMode] = useState<SortMode>("category");
    const [showFilters, setShowFilters] = useState(false);

    // Close filters dropdown on outside click
    useEffect(() => {
        if (!showFilters) return;
        const handler = (e: MouseEvent) => {
            if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) {
                setShowFilters(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [showFilters]);

    // Load current selection when dialog opens
    const openDialog = useCallback(() => {
        const current = new Set(
            indParam.split(",").filter(Boolean).map((s) => s.trim().toLowerCase())
        );
        setSelectedIndicators(current);
        setSearchQuery("");
        setSortMode("category");
        setShowFilters(false);
        setDialogOpen(true);
    }, [indParam]);

    // Toggle indicator in local selection
    const toggleSelection = useCallback((key: string) => {
        setSelectedIndicators((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    }, []);

    // Apply (just update URL)
    const applySelection = useCallback(
        (optimize: boolean) => {
            const params = new URLSearchParams(searchParams.toString());
            const newIndStr = Array.from(selectedIndicators).join(",");

            if (newIndStr) {
                params.set("ind", newIndStr);
            } else {
                params.delete("ind");
            }

            // Optimize flag
            if (optimize) {
                params.set("optimize", "1");
            } else {
                params.delete("optimize");
            }

            if (symbol) params.set("symbol", symbol);

            router.replace(`${pathname}?${params.toString()}`, { scroll: false });
            router.refresh();
            setDialogOpen(false);
        },
        [selectedIndicators, searchParams, pathname, router, symbol]
    );

    // All indicators flat-sorted alphabetically
    const allIndicatorsSorted = useMemo(() => {
        return [...INDICATOR_DETAILS].sort((a, b) => a.label.localeCompare(b.label));
    }, []);

    // Filtered indicators based on search
    const filteredGroups = useMemo(() => {
        if (!searchQuery.trim()) {
            if (sortMode === "alphabetical") {
                return [{ key: "all", icon: "📊", label: "All Indicators", items: allIndicatorsSorted }];
            }
            return groupedIndicators;
        }

        const q = searchQuery.toLowerCase();
        const filterFn = (ind: typeof INDICATOR_DETAILS[number]) =>
            ind.label.toLowerCase().includes(q) ||
            ind.full.toLowerCase().includes(q) ||
            ind.key.toLowerCase().includes(q);

        if (sortMode === "alphabetical") {
            const filtered = allIndicatorsSorted.filter(filterFn);
            return filtered.length > 0
                ? [{ key: "all", icon: "📊", label: "All Indicators", items: filtered }]
                : [];
        }

        return groupedIndicators
            .map((g) => ({
                ...g,
                items: g.items.filter(filterFn),
            }))
            .filter((g) => g.items.length > 0);
    }, [searchQuery, sortMode, allIndicatorsSorted]);

    const selectedCount = selectedIndicators.size;

    return (
        <>
            <Button
                variant="secondary"
                className={cn(
                    "search-btn",
                    selectedCount > 0 && "border-yellow-500/40 text-yellow-400"
                )}
                onClick={openDialog}
            >
                <Layers className="w-3.5 h-3.5 mr-1.5 opacity-60" />
                Indicators
                {selectedCount > 0 && (
                    <span className="ml-1.5 text-[10px] font-bold bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full">
                        {selectedCount}
                    </span>
                )}
            </Button>

            <TAGlassDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                title="Indicators"
                icon={<Layers className="w-4 h-4 text-yellow-400" />}
                width="max-w-lg"
                footer={
                    <div className="flex items-center justify-end w-full">
                        <div className="flex items-center gap-2">
                            {selectedCount > 0 && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs text-gray-400 hover:text-gray-200"
                                    onClick={() => setSelectedIndicators(new Set())}
                                >
                                    Clear
                                </Button>
                            )}
                            <Button
                                variant="secondary"
                                size="sm"
                                className="text-xs font-medium transition-all bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20"
                                onClick={() => applySelection(false)}
                            >
                                <Check className="w-3.5 h-3.5 mr-1" />
                                Apply
                            </Button>
                            <Button
                                size="sm"
                                className="text-xs font-medium transition-all bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20"
                                onClick={() => applySelection(true)}
                            >
                                <Sparkles className="w-3.5 h-3.5 mr-1" />
                                Apply & Optimize
                            </Button>
                        </div>
                    </div>
                }
            >
                {/* Search + Filters row */}
                <div className="flex items-center gap-2 mb-3">
                    {/* Search input — ~75% */}
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Filter indicators..."
                            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg
                                bg-gray-800 border border-gray-700 text-gray-200
                                placeholder:text-gray-500
                                focus:outline-none focus:border-yellow-500/40 focus:bg-gray-700
                                transition-colors"
                        />
                    </div>

                    {/* Filters button — ~25% */}
                    <div className="relative shrink-0" ref={filtersRef}>
                        <Button
                            variant="secondary"
                            size="sm"
                            className={cn(
                                "text-xs gap-1.5 px-2.5 py-1.5 h-[30px]",
                                sortMode !== "category"
                                    ? "border-yellow-500/30 text-yellow-400"
                                    : "border-gray-700 text-gray-400"
                            )}
                            onClick={() => setShowFilters((v) => !v)}
                        >
                            <SlidersHorizontal className="w-3 h-3" />
                            <span className="hidden sm:inline">Filters</span>
                        </Button>

                        {/* Filters dropdown */}
                        {showFilters && (
                            <div className="absolute right-0 top-full mt-1 w-44 z-50
                                bg-gray-900 border border-gray-700 rounded-lg shadow-lg py-1">
                                <div className="px-3 py-1.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                                    Sort by
                                </div>
                                <button
                                    onClick={() => { setSortMode("category"); setShowFilters(false); }}
                                    className={cn(
                                        "w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors text-left",
                                        sortMode === "category"
                                            ? "text-yellow-400 bg-yellow-500/10"
                                            : "text-gray-400 hover:bg-white/5"
                                    )}
                                >
                                    <LayoutGrid className="w-3 h-3 shrink-0" />
                                    <span>By Category</span>
                                    {sortMode === "category" && <Check className="w-3 h-3 ml-auto" />}
                                </button>
                                <button
                                    onClick={() => { setSortMode("alphabetical"); setShowFilters(false); }}
                                    className={cn(
                                        "w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors text-left",
                                        sortMode === "alphabetical"
                                            ? "text-yellow-400 bg-yellow-500/10"
                                            : "text-gray-400 hover:bg-white/5"
                                    )}
                                >
                                    <SortAsc className="w-3 h-3 shrink-0" />
                                    <span>Alphabetical A–Z</span>
                                    {sortMode === "alphabetical" && <Check className="w-3 h-3 ml-auto" />}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Indicator list by category */}
                <div className="space-y-3">
                    {filteredGroups.map((group) => (
                        <div key={group.key}>
                            {/* Category header — only show when sortMode === "category" */}
                            {sortMode === "category" && (
                                <div className="flex items-center gap-1.5 mb-1.5">
                                    <span className="text-xs opacity-60">{group.icon}</span>
                                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                                        {getCategoryLabel(group.key)}
                                    </span>
                                    <span className="text-[10px] text-gray-500 ml-auto">
                                        {group.items.length}
                                    </span>
                                </div>
                            )}

                            {/* Items */}
                            <div className="space-y-0.5">
                                {group.items.map((ind) => {
                                    const isSelected = selectedIndicators.has(ind.key);

                                    return (
                                        <button
                                            key={ind.key}
                                            onClick={() => toggleSelection(ind.key)}
                                            className={cn(
                                                "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg",
                                                "transition-all duration-150 text-left",
                                                isSelected
                                                    ? "bg-yellow-500/10 border border-yellow-500/30"
                                                    : "hover:bg-white/5 border border-transparent"
                                            )}
                                        >
                                            {/* Color dot + icon */}
                                            <div
                                                className="w-7 h-7 rounded-md flex items-center justify-center text-xs shrink-0"
                                                style={{
                                                    backgroundColor: `${ind.color}15`,
                                                    borderColor: `${ind.color}30`,
                                                    borderWidth: 1,
                                                }}
                                            >
                                                <span style={{ color: ind.color }}>
                                                    {ind.icon}
                                                </span>
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span
                                                        className="text-sm font-medium text-gray-200"
                                                        style={{ color: isSelected ? ind.color : undefined }}
                                                    >
                                                        {ind.label}
                                                    </span>
                                                    <span className="text-[10px] text-gray-400 truncate hidden sm:inline">
                                                        {ind.full}
                                                    </span>
                                                </div>
                                                <div className="text-[10px] text-gray-500 truncate mt-0.5">
                                                    {ind.description}
                                                </div>
                                            </div>

                                            {/* Checkbox — amber */}
                                            <div
                                                className={cn(
                                                    "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all",
                                                    isSelected
                                                        ? "border-yellow-500 bg-yellow-500/20"
                                                        : "border-gray-600 bg-transparent"
                                                )}
                                            >
                                                {isSelected && (
                                                    <Check className="w-3 h-3 text-yellow-400" />
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {filteredGroups.length === 0 && (
                        <div className="text-center py-6 text-gray-500 text-xs">
                            No indicators match "{searchQuery}"
                        </div>
                    )}
                </div>
            </TAGlassDialog>
        </>
    );
};

export default TAIndicatorsButton;