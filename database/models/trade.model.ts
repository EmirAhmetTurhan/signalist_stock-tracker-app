// database/models/trade.model.ts — Immutable append-only trade ledger
// Each document is one executed (or attempted) fill. Never mutated after insert.
// triggerContext is the audit trail — the most important field in the system.

import { Schema, model, models, Document, Types } from 'mongoose';

export interface ITriggerContext {
  strategyId?: string;
  signalSnapshot?: Record<string, unknown>;
  aiConversationId?: string;
  aiMessageId?: string;
  quoteSourceTimestamp?: Date;
  slippageBps?: number;
}

export interface ITrade extends Document {
  userId: string;
  positionId: Types.ObjectId | null;
  clientRequestId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  fillPrice: Types.Decimal128;
  notional: Types.Decimal128;
  fees: Types.Decimal128;
  realizedPnl: Types.Decimal128 | null;
  triggerSource: 'manual' | 'ai_proposal' | 'strategy' | 'limit_order' | 'stop_loss' | 'take_profit' | 'corporate_action';
  triggerContext: ITriggerContext;
  status: 'executed' | 'failed' | 'reversed';
  failureReason: string | null;
  executedAt: Date;
  createdAt: Date;
}

const TriggerContextSchema = new Schema<ITriggerContext>({
  strategyId: { type: String },
  signalSnapshot: { type: Schema.Types.Mixed },
  aiConversationId: { type: String },
  aiMessageId: { type: String },
  quoteSourceTimestamp: { type: Date },
  slippageBps: { type: Number },
}, { _id: false });

const TradeSchema = new Schema<ITrade>({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  positionId: {
    type: Schema.Types.ObjectId,
    default: null,
  },
  clientRequestId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    index: true,
  },
  side: {
    type: String,
    enum: ['BUY', 'SELL'],
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, 'Quantity must be at least 1'],
  },
  fillPrice: {
    type: Schema.Types.Decimal128,
    required: true,
  },
  notional: {
    type: Schema.Types.Decimal128,
    required: true,
  },
  fees: {
    type: Schema.Types.Decimal128,
    required: true,
    default: Types.Decimal128.fromString('0'),
  },
  realizedPnl: {
    type: Schema.Types.Decimal128,
    default: null,
  },
  triggerSource: {
    type: String,
    enum: ['manual', 'ai_proposal', 'strategy', 'limit_order', 'stop_loss', 'take_profit', 'corporate_action'],
    required: true,
  },
  triggerContext: {
    type: TriggerContextSchema,
    default: {},
  },
  status: {
    type: String,
    enum: ['executed', 'failed', 'reversed'],
    required: true,
    default: 'executed',
  },
  failureReason: {
    type: String,
    default: null,
  },
  executedAt: {
    type: Date,
    required: true,
    index: true,
  },
}, {
  timestamps: true,
  toJSON: {
    transform: (_doc, ret: Record<string, unknown>) => {
      if (ret.fillPrice) ret.fillPrice = String(ret.fillPrice);
      if (ret.notional) ret.notional = String(ret.notional);
      if (ret.fees) ret.fees = String(ret.fees);
      if (ret.realizedPnl) ret.realizedPnl = String(ret.realizedPnl);
      return ret;
    },
  },
});

// Compound indexes for efficient queries
TradeSchema.index({ userId: 1, executedAt: -1 });
TradeSchema.index({ userId: 1, symbol: 1, executedAt: -1 });
TradeSchema.index({ triggerSource: 1 });

const Trade = models.Trade || model<ITrade>('Trade', TradeSchema);

export default Trade;
