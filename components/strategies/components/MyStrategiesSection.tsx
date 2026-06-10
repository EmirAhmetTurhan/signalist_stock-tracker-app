import {
    Users,
    ArrowUpDown,
    Loader2,
    Plus,
    Target,
    Check,
    X,
    Pin,
    PinOff,
    Edit3,
    Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { INDICATOR_DETAILS } from "@/lib/constants/indicator-categories";
import { SavedStrategyItem, SortField, SortConfig } from "../types";
import { getStrategyKey } from "../hooks/useStrategyActions";
import SortButton from "./SortButton";

const SORT_OPTIONS: { value: SortField; label: string }[] = [
    { value: 'date', label: 'Date' },
    { value: 'name', label: 'Name' },
    { value: 'winRate', label: 'Win Rate' },
    { value: 'signals', label: 'Signals' },
    { value: 'sharpe', label: 'Sharpe' },
    { value: 'profitFactor', label: 'Profit' },
];

interface MyStrategiesSectionProps {
    myStrategies: SavedStrategyItem[];
    loadingSaved: boolean;
    selectedStrategy: string;
    onToggleStrategy: (key: string) => void;
    onToggleSort: (section: 'my' | 'discovered', field: SortField) => void;
    currentSort: SortConfig;
    togglingPin: Set<string>;
    deletingStrategy: Set<string>;
    renameTarget: string | null;
    renameValue: string;
    setRenameValue: (val: string) => void;
    confirmRename: (e: React.MouseEvent | React.KeyboardEvent) => void;
    cancelRename: (e?: React.MouseEvent) => void;
    renamingStrategy: string | null;
    handleTogglePin: (e: React.MouseEvent, strategyId: string) => void;
    startRename: (e: React.MouseEvent, item: SavedStrategyItem) => void;
    handleDelete: (item: SavedStrategyItem, e: React.MouseEvent) => void;
    onCreateClick: () => void;
}

export function MyStrategiesSection({
    myStrategies,
    loadingSaved,
    selectedStrategy,
    onToggleStrategy,
    onToggleSort,
    currentSort,
    togglingPin,
    deletingStrategy,
    renameTarget,
    renameValue,
    setRenameValue,
    confirmRename,
    cancelRename,
    renamingStrategy,
    handleTogglePin,
    startRename,
    handleDelete,
    onCreateClick,
}: MyStrategiesSectionProps) {
    return (
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
                    <SortButton
                        key={opt.value}
                        section="my"
                        field={opt.value}
                        label={opt.label}
                        currentSort={currentSort}
                        onToggleSort={onToggleSort}
                    />
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
                        onClick={onCreateClick}
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
                        const isPinning = togglingPin.has(item.id);
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
                                    onClick={() => onToggleStrategy(key)}
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
                                            disabled={isPinning}
                                            className={cn(
                                                "w-6 h-6 flex items-center justify-center rounded-md transition-all",
                                                item.pinned
                                                    ? "text-emerald-400 hover:bg-emerald-500/10"
                                                    : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                                            )}
                                        >
                                            {isPinning ? (
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
    );
}

export default MyStrategiesSection;
