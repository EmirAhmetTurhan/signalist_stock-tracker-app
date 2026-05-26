import { Schema, model, models, Document, Types } from 'mongoose';

export interface IPositionSizing {
  mode: 'fixed_cash' | 'percent_portfolio' | 'fixed_shares';
  value: number;
}

export interface IForwardTestStrategy extends Document {
  userId: string;
  name: string;
  symbol: string;
  interval: '1d' | '4h';
  indicatorConfig: any; // Can be a composite of multiple indicators
  entryRule: any;       // E.g., { condition: 'RSI < 30' } or AST
  exitRule: any;        // E.g., { condition: 'RSI > 70' }
  positionSizing: IPositionSizing;
  executionMode: 'shadow' | 'auto' | 'propose_only';
  status: 'draft' | 'running' | 'paused' | 'stopped';
  capitalAllocated: Types.Decimal128; // Theoretical max capital
  
  // Risk and mechanics
  cooldownHours: number; // Prevent oscillating signals
  timeStop: number | null; // Max holding days/periods
  version: number;
  parentStrategyId: Types.ObjectId | null;

  // Execution tracking
  lastEvaluatedAt: Date | null;
  nextEvaluationAt: Date | null;
  signalsLogged: number;
  tradesExecuted: number;
  
  // Shadow performance tracking
  shadowPnl: Types.Decimal128;
  shadowTrades: number;
  shadowCurrentPosition: boolean;
  shadowEntryPrice: Types.Decimal128 | null;

  createdAt: Date;
  updatedAt: Date;
}

const PositionSizingSchema = new Schema<IPositionSizing>({
  mode: { 
    type: String, 
    enum: ['fixed_cash', 'percent_portfolio', 'fixed_shares'], 
    required: true 
  },
  value: { type: Number, required: true },
}, { _id: false });

const ForwardTestStrategySchema = new Schema<IForwardTestStrategy>({
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  symbol: { type: String, required: true, uppercase: true, index: true },
  interval: { type: String, enum: ['1d', '4h'], required: true },
  
  indicatorConfig: { type: Schema.Types.Mixed, required: true },
  entryRule: { type: Schema.Types.Mixed, required: true },
  exitRule: { type: Schema.Types.Mixed, required: true },
  positionSizing: { type: PositionSizingSchema, required: true },
  
  executionMode: { 
    type: String, 
    enum: ['shadow', 'auto', 'propose_only'], 
    default: 'shadow' 
  },
  status: { 
    type: String, 
    enum: ['draft', 'running', 'paused', 'stopped'], 
    default: 'draft' 
  },
  capitalAllocated: { type: Schema.Types.Decimal128, required: true },
  
  cooldownHours: { type: Number, default: 24 },
  timeStop: { type: Number, default: null },
  version: { type: Number, default: 1 },
  parentStrategyId: { type: Schema.Types.ObjectId, ref: 'ForwardTestStrategy', default: null },

  lastEvaluatedAt: { type: Date, default: null },
  nextEvaluationAt: { type: Date, default: null },
  signalsLogged: { type: Number, default: 0 },
  tradesExecuted: { type: Number, default: 0 },
  
  shadowPnl: { type: Schema.Types.Decimal128, default: Types.Decimal128.fromString('0') },
  shadowTrades: { type: Number, default: 0 },
  shadowCurrentPosition: { type: Boolean, default: false },
  shadowEntryPrice: { type: Schema.Types.Decimal128, default: null },
}, {
  timestamps: true,
  toJSON: {
    transform: (_doc, ret) => {
      if (ret.capitalAllocated) ret.capitalAllocated = ret.capitalAllocated.toString() as any;
      if (ret.shadowPnl) ret.shadowPnl = ret.shadowPnl.toString() as any;
      return ret;
    },
  },
});

// Index for efficiently fetching active strategies for the evaluator
ForwardTestStrategySchema.index({ status: 1, interval: 1 });

const ForwardTestStrategy = models.ForwardTestStrategy || model<IForwardTestStrategy>('ForwardTestStrategy', ForwardTestStrategySchema);

export default ForwardTestStrategy;
