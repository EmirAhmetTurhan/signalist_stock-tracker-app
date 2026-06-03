// database/models/strategy-meta.model.ts — Bayesian Beta-Binomial Meta-Learning
// Tracks historical win-rate posteriors per indicator-combo per market regime.
// Used by: Dempster-Shafer voting weights (signalToBBA confidence),
//          discoverStrategyAction (auto-save on discovery),
//          strategy-optimizer.ts (getHistoricalAccuracy lookup).

import { Schema, model, models, Document } from 'mongoose';

export interface IRegimeBreakdown {
    regime: string;
    alpha: number;   // Beta distribution alpha (wins + 1)
    beta: number;    // Beta distribution beta (losses + 1)
    tradesCount: number;
    lastUpdated: Date;
}

export interface IStrategyMeta extends Document {
    indicatorHash: string;        // MD5 of sorted indicator keys
    parameters: Record<string, number>;
    regimeBreakdown: IRegimeBreakdown[];
    lastUpdated: Date;
}

const RegimeBreakdownSchema = new Schema<IRegimeBreakdown>({
    regime: {
        type: String,
        enum: ['uptrend', 'downtrend', 'ranging', 'volatile', 'neutral'],
        required: true,
    },
    alpha: { type: Number, default: 1 },
    beta: { type: Number, default: 1 },
    tradesCount: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now },
}, { _id: false });

const StrategyMetaSchema = new Schema<IStrategyMeta>({
    indicatorHash: { type: String, required: true, index: true, unique: true },
    parameters: { type: Schema.Types.Mixed, default: {} },
    regimeBreakdown: { type: [RegimeBreakdownSchema], default: [] },
    lastUpdated: { type: Date, default: Date.now },
});

export const StrategyMeta = models.StrategyMeta || model<IStrategyMeta>('StrategyMeta', StrategyMetaSchema);
