// database/models/position.model.ts
import { Schema, model, models, Document, Types } from 'mongoose';

export interface IPosition extends Document {
  walletId: Types.ObjectId;
  userId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  status: 'open' | 'closed' | 'delisted';
  quantity: Types.Decimal128;
  avgEntryPrice: Types.Decimal128;
  currentPrice: Types.Decimal128;
  unrealizedPnl: Types.Decimal128;
  costBasis: Types.Decimal128;
  realizedPnl: Types.Decimal128;
  mfe: Types.Decimal128;
  mae: Types.Decimal128;
  maxDrawdown: number;
  openedAt: Date;
  lastTradeAt: Date;
  closedAt: Date | null;
  exitReason: 'stop_loss' | 'take_profit' | 'trailing_stop' | 'time_stop' | 'opposite_signal' | 'bankruptcy' | 'delisted' | 'manual' | null;
  entryBarTime?: number;
  createdAt: Date;
  updatedAt: Date;
}

const PositionSchema = new Schema<IPosition>({
  walletId: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true, index: true },
  userId: { type: String, required: true, index: true },
  symbol: { type: String, required: true, uppercase: true, index: true },
  side: { type: String, enum: ['LONG', 'SHORT'], required: true },
  status: { type: String, enum: ['open', 'closed', 'delisted'], default: 'open', index: true },
  quantity: { type: Schema.Types.Decimal128, required: true },
  avgEntryPrice: { type: Schema.Types.Decimal128, required: true },
  currentPrice: { type: Schema.Types.Decimal128, default: Types.Decimal128.fromString('0') },
  unrealizedPnl: { type: Schema.Types.Decimal128, default: Types.Decimal128.fromString('0') },
  costBasis: { type: Schema.Types.Decimal128, required: true },
  realizedPnl: { type: Schema.Types.Decimal128, default: Types.Decimal128.fromString('0') },
  mfe: { type: Schema.Types.Decimal128, default: Types.Decimal128.fromString('0') },
  mae: { type: Schema.Types.Decimal128, default: Types.Decimal128.fromString('0') },
  maxDrawdown: { type: Number, default: 0 },
  openedAt: { type: Date, required: true },
  lastTradeAt: { type: Date, required: true },
  closedAt: { type: Date, default: null },
  exitReason: { type: String, enum: ['stop_loss', 'take_profit', 'trailing_stop', 'time_stop', 'opposite_signal', 'bankruptcy', 'delisted', 'manual', null], default: null },
  entryBarTime: { type: Number },
}, {
  timestamps: true,
  toJSON: {
    transform: (_doc, ret: Record<string, unknown>) => {
      if (ret.quantity != null) ret.quantity = String(ret.quantity);
      if (ret.avgEntryPrice != null) ret.avgEntryPrice = String(ret.avgEntryPrice);
      if (ret.currentPrice != null) ret.currentPrice = String(ret.currentPrice);
      if (ret.unrealizedPnl != null) ret.unrealizedPnl = String(ret.unrealizedPnl);
      if (ret.costBasis != null) ret.costBasis = String(ret.costBasis);
      if (ret.realizedPnl != null) ret.realizedPnl = String(ret.realizedPnl);
      if (ret.mfe != null) ret.mfe = String(ret.mfe);
      if (ret.mae != null) ret.mae = String(ret.mae);
      return ret;
    }
  }
});

PositionSchema.index({ walletId: 1, symbol: 1, status: 1 });

const Position = models.Position || model<IPosition>('Position', PositionSchema);
export default Position;
