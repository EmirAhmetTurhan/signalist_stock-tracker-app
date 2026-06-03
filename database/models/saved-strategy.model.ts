import { Schema, model, models, Document } from 'mongoose';
import type { Timeframe, StrategyMode } from '@/lib/ta/types';

export interface ISavedStrategy extends Document {
    userId: string;
    name: string;
    indicators: string[];
    mode: StrategyMode;
    lookForward: number;

    // Discovery metadata (populated when auto-saved from discovery)
    discoveredParams?: Record<string, number>;
    discoveredWinRate?: number;
    discoveredTotalSignals?: number;
    discoveredSymbol?: string;
    discoveredInterval?: string;

    // ─── Multi-Metric Discovery (Phase 2b+) ───
    discoveredProfitFactor?: number;
    discoveredSharpeRatio?: number;
    discoveredAvgWin?: number;
    discoveredAvgLoss?: number;
    discoveredMaxDrawdown?: number;
    discoveredTotalReturn?: number;
    /** Per-regime performance breakdown */
    discoveredRegimeBreakdown?: Record<string, {
        winRate: number;
        totalSignals: number;
        wins: number;
        avgReturn: number;
        totalReturn: number;
    }>;

    // ★ UI/UX fields for the redesigned TAStrategiesButton dialog
    /** Whether the strategy is pinned/favorited — pinned items sort first */
    pinned: boolean;
    /** Link back to the Archive report this strategy was imported from */
    sourceReportId?: string;
    /** true = imported from discovery results, false = manually created */
    isDiscovered: boolean;

    createdAt: Date;
    updatedAt: Date;
}

const SavedStrategySchema = new Schema<ISavedStrategy>({
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    indicators: { type: [String], required: true },
    mode: { type: String, enum: ['all', 'majority'], default: 'all' },
    lookForward: { type: Number, default: 14 },

    discoveredParams: { type: Schema.Types.Mixed, default: null },
    discoveredWinRate: { type: Number, default: null },
    discoveredTotalSignals: { type: Number, default: null },
    discoveredSymbol: { type: String, default: null },
    discoveredInterval: { type: String, default: null },

    // ─── Multi-Metric Discovery Fields ───
    discoveredProfitFactor: { type: Number, default: null },
    discoveredSharpeRatio: { type: Number, default: null },
    discoveredAvgWin: { type: Number, default: null },
    discoveredAvgLoss: { type: Number, default: null },
    discoveredMaxDrawdown: { type: Number, default: null },
    discoveredTotalReturn: { type: Number, default: null },
    discoveredRegimeBreakdown: { type: Schema.Types.Mixed, default: null },

    pinned: { type: Boolean, default: false },
    sourceReportId: { type: String, default: null },
    isDiscovered: { type: Boolean, default: false },
}, {
    timestamps: true,
});

SavedStrategySchema.index({ userId: 1, createdAt: -1 });
// Index for fetching pinned items efficiently
SavedStrategySchema.index({ userId: 1, pinned: -1, createdAt: -1 });

const SavedStrategy = models.SavedStrategy || model<ISavedStrategy>('SavedStrategy', SavedStrategySchema);

export default SavedStrategy;
