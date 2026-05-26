// database/models/position.model.ts — Open/Closed positions (separate from trades)
// Positions = small hot dataset queried on every portfolio render.
// Trades = unbounded append-only log queried for history.
// Closed positions stay in collection (trades.positionId needs them) but fall out of the hot-path index.

import { Schema, model, models, Document, Types } from 'mongoose';

export interface ISplitAdjustment {
  ratio: number;
  effectiveDate: Date;
}

export interface IPosition extends Document {
  userId: string;
  symbol: string;
  status: 'open' | 'closed' | 'delisted';
  quantity: number;
  reservedQuantity: number;
  avgEntryPrice: Types.Decimal128;
  totalCostBasis: Types.Decimal128;
  realizedPnlToDate: Types.Decimal128;
  openedAt: Date;
  lastTradeAt: Date;
  closedAt: Date | null;
  closeReason: 'user_sell' | 'stop_loss' | 'take_profit' | 'strategy_exit' | 'delisting' | null;
  splitAdjustments: ISplitAdjustment[];
  createdAt: Date;
  updatedAt: Date;
}

const SplitAdjustmentSchema = new Schema<ISplitAdjustment>({
  ratio: { type: Number, required: true },
  effectiveDate: { type: Date, required: true },
}, { _id: false });

const PositionSchema = new Schema<IPosition>({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['open', 'closed', 'delisted'],
    default: 'open',
    index: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 0,
  },
  reservedQuantity: {
    type: Number,
    required: true,
    default: 0,
  },
  avgEntryPrice: {
    type: Schema.Types.Decimal128,
    required: true,
  },
  totalCostBasis: {
    type: Schema.Types.Decimal128,
    required: true,
  },
  realizedPnlToDate: {
    type: Schema.Types.Decimal128,
    default: Types.Decimal128.fromString('0'),
  },
  openedAt: {
    type: Date,
    required: true,
  },
  lastTradeAt: {
    type: Date,
    required: true,
  },
  closedAt: {
    type: Date,
    default: null,
  },
  closeReason: {
    type: String,
    enum: ['user_sell', 'stop_loss', 'take_profit', 'strategy_exit', 'delisting', null],
    default: null,
  },
  splitAdjustments: {
    type: [SplitAdjustmentSchema],
    default: [],
  },
}, {
  timestamps: true,
  toJSON: {
    transform: (_doc, ret) => {
      if (ret.avgEntryPrice) ret.avgEntryPrice = ret.avgEntryPrice.toString() as any;
      if (ret.totalCostBasis) ret.totalCostBasis = ret.totalCostBasis.toString() as any;
      if (ret.realizedPnlToDate) ret.realizedPnlToDate = ret.realizedPnlToDate.toString() as any;
      return ret;
    },
  },
});

// Compound index with partial filter for the hot path (only open positions)
PositionSchema.index(
  { userId: 1, symbol: 1, status: 1 },
  { partialFilterExpression: { status: 'open' } }
);

const Position = models.Position || model<IPosition>('Position', PositionSchema);

export default Position;
