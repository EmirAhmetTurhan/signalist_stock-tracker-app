import { Lightbulb, Plus } from "lucide-react";

interface StrategyActionButtonsProps {
    candles?: any[];
    allData?: any;
    onDiscoverClick: () => void;
    onCreateClick: () => void;
}

export function StrategyActionButtons({
    candles,
    allData,
    onDiscoverClick,
    onCreateClick,
}: StrategyActionButtonsProps) {
    return (
        <div className="flex items-center gap-2 mt-2">
            <button
                onClick={onDiscoverClick}
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
                onClick={onCreateClick}
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
    );
}

export default StrategyActionButtons;
