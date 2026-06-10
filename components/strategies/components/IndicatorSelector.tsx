import React from "react";
import { CheckCircle2, Circle, ChevronRight } from "lucide-react";
import { AVAILABLE_INDICATORS } from "../constants";

interface IndicatorSelectorProps {
    selected: Set<string>;
    onToggle: (key: string) => void;
}

export default function IndicatorSelector({ selected, onToggle }: IndicatorSelectorProps) {
    return (
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
                            onClick={() => onToggle(ind.key)}
                            type="button"
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
    );
}
