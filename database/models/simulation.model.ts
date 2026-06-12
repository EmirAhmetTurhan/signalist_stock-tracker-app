// database/models/simulation.model.ts
import { Schema, model, models, Document, Types } from 'mongoose';

export interface IEquityPoint {
  t: Date;
  eq: Types.Decimal128;
  c: Types.Decimal128;
  dd: number;
}

export interface ITradeHistoryItem {
  transactionId: Types.ObjectId;
  t: Date;
  symbol: string;
  type: 'BUY' | 'SELL' | 'CORPORATE_ACTION';
  quantity: Types.Decimal128;
  price: Types.Decimal128;
  realizedPnl: Types.Decimal128 | null;
  exitReason: 'stop_loss' | 'take_profit' | 'trailing_stop' | 'time_stop' | 'opposite_signal' | 'bankruptcy' | 'delisted' | 'manual' | null;
}

export interface IStrategyPortfolioItem {
  originalStrategyId: Types.ObjectId;
  weight: number;
  engineVersion: string;
  indicators: any[];
  bestParams: Record<string, any>;
  riskProfile: Record<string, any>;
}

export interface IFinalMetrics {
  totalReturn: Types.Decimal128;
  totalSignals: number;
  exitReasonBreakdown: Map<string, number>;
  winRate: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  cagr: number;
  alpha: number;
  beta: number;
  profitFactor: number;
}

export interface ISimulation extends Document {
  userId: string;
  walletId: Types.ObjectId;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  benchmarkSymbol: string;
  testSymbol: string;
  interval: '1d' | '4h';
  positionSizingConfig: {
    type: 'all_in' | 'fixed_fractional' | 'risk_based' | 'half_kelly';
    value?: number;
  };
  strategyPortfolio: IStrategyPortfolioItem[];
  finalMetrics?: IFinalMetrics;
  engineVersion: string;
  startDate: Date;
  endDate: Date;
  lastProcessedDate: Date | null;
  equityCurve: IEquityPoint[];
  benchmarkCurve: IEquityPoint[];
  tradeHistory: ITradeHistoryItem[];
  createdAt: Date;
  updatedAt: Date;
  failedAt: Date | null;
  benchmarkUnavailable?: boolean;
  processedChunks?: string[];
}

const EquityPointSchema = new Schema<IEquityPoint>({
  t: { type: Date, required: true },
  eq: { type: Schema.Types.Decimal128, required: true },
  c: { type: Schema.Types.Decimal128, required: true },
  dd: { type: Number, required: true },
}, { _id: false });

const TradeHistoryItemSchema = new Schema<ITradeHistoryItem>({
  transactionId: { type: Schema.Types.ObjectId, required: true },
  t: { type: Date, required: true },
  symbol: { type: String, required: true, uppercase: true },
  type: { type: String, enum: ['BUY', 'SELL', 'CORPORATE_ACTION'], required: true },
  quantity: { type: Schema.Types.Decimal128, required: true },
  price: { type: Schema.Types.Decimal128, required: true },
  realizedPnl: { type: Schema.Types.Decimal128, default: null },
  exitReason: { type: String, enum: ['stop_loss', 'take_profit', 'trailing_stop', 'time_stop', 'opposite_signal', 'bankruptcy', 'delisted', 'manual', null], default: null },
}, { _id: false });

const SimulationSchema = new Schema<ISimulation>({
  userId: { type: String, required: true, index: true },
  walletId: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true, index: true },
  status: { type: String, enum: ['queued', 'running', 'completed', 'failed'], default: 'queued', index: true },
  failedAt: { type: Date, default: null },
  progress: { type: Number, default: 0, min: 0, max: 100 },
  benchmarkSymbol: { type: String, default: 'SPY' },
  testSymbol: { type: String, uppercase: true, index: true },
  interval: { type: String, enum: ['1d', '4h'], default: '1d' },
  positionSizingConfig: {
    type: { type: String, enum: ['all_in', 'fixed_fractional', 'risk_based', 'half_kelly'], required: true },
    value: { type: Number },
  },
  strategyPortfolio: [{
    originalStrategyId: { type: Schema.Types.ObjectId, required: true },
    weight: { type: Number, required: true },
    engineVersion: { type: String, required: true },
    indicators: [{ type: Schema.Types.Mixed }],
    bestParams: { type: Schema.Types.Mixed },
    riskProfile: { type: Schema.Types.Mixed }
  }],
  finalMetrics: {
    totalReturn: Schema.Types.Decimal128,
    totalSignals: Number,
    exitReasonBreakdown: { type: Map, of: Number },
    winRate: Number,
    sharpeRatio: Number,
    sortinoRatio: Number,
    maxDrawdown: Number,
    cagr: Number,
    alpha: Number,
    beta: Number,
    profitFactor: Number
  },
  engineVersion: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  lastProcessedDate: { type: Date, default: null },
  equityCurve: [EquityPointSchema],
  benchmarkCurve: [EquityPointSchema],
  tradeHistory: [TradeHistoryItemSchema],
  benchmarkUnavailable: { type: Boolean, default: false },
  processedChunks: [{ type: String }],
}, {
  timestamps: true,
  toJSON: {
    transform: (_doc, ret: Record<string, unknown>) => {
      // Stringify subdoc Decimal128 instances for frontend
      if (Array.isArray(ret.equityCurve)) {
        ret.equityCurve = ret.equityCurve.map(p => ({ ...p, eq: p.eq != null ? String(p.eq) : null, c: p.c != null ? String(p.c) : null }));
      }
      if (Array.isArray(ret.benchmarkCurve)) {
        ret.benchmarkCurve = ret.benchmarkCurve.map(p => ({ ...p, eq: p.eq != null ? String(p.eq) : null, c: p.c != null ? String(p.c) : null }));
      }
      if (Array.isArray(ret.tradeHistory)) {
        ret.tradeHistory = ret.tradeHistory.map((t: any) => ({ 
          ...t, 
          quantity: t.quantity != null ? String(t.quantity) : null,
          price: t.price != null ? String(t.price) : null, 
          realizedPnl: t.realizedPnl != null ? String(t.realizedPnl) : null 
        }));
      }
      return ret;
    }
  }
});

const Simulation = models.Simulation || model<ISimulation>('Simulation', SimulationSchema);
export default Simulation;
