import { Shield, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const BUILT_IN_STRATEGIES = [
    {
        key: "rsi_cci_wt",
        label: "RSI + CCI + WaveTrend",
        description: "Trade when 3 indicators signal in the same direction",
        isBuiltIn: true,
    },
] as const;

interface BuiltInStrategiesSectionProps {
    selectedStrategy: string;
    onToggleStrategy: (key: string) => void;
}

export function BuiltInStrategiesSection({
    selectedStrategy,
    onToggleStrategy,
}: BuiltInStrategiesSectionProps) {
    return (
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
                        onClick={() => onToggleStrategy(s.key)}
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
    );
}

export default BuiltInStrategiesSection;
