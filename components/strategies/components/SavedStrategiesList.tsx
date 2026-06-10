import React from "react";
import { Loader2, Database, Trash2, BarChart3 } from "lucide-react";
import { AVAILABLE_INDICATORS } from "../constants";
import { SavedStrategyItem } from "../types";

interface SavedStrategiesListProps {
    loading: boolean;
    savedStrategies: SavedStrategyItem[];
    userId?: string;
    onLoad: (item: SavedStrategyItem) => void;
    onDelete: (id: string) => void;
}

export default function SavedStrategiesList({
    loading,
    savedStrategies,
    userId,
    onLoad,
    onDelete,
}: SavedStrategiesListProps) {
    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
                <span className="ml-2 text-xs text-gray-400">Loading saved strategies...</span>
            </div>
        );
    }

    if (savedStrategies.length === 0) {
        return (
            <div className="text-center py-8">
                <Database className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                <p className="text-[11px] text-gray-500">
                    No saved strategies yet.<br />
                    Run Strategy Discovery to auto-save top results.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {savedStrategies.map(item => (
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
                            type="button"
                            onClick={() => onLoad(item)}
                            className="flex-1 text-[10px] bg-violet-600 hover:bg-violet-500 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
                        >
                            Load Strategy
                        </button>
                        <button
                            type="button"
                            onClick={() => onDelete(item.id)}
                            className="text-[10px] bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-800/40 font-medium px-3 py-1.5 rounded-lg transition-colors"
                        >
                            <Trash2 className="w-3 h-3" />
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
