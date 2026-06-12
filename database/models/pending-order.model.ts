// database/models/pending-order.model.ts

import { Schema, model, models, Document, Types } from 'mongoose';

export interface IPendingOrder extends Document {
  userId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType: 'limit' | 'stop_loss' | 'take_profit' | 'market_on_open';
  quantity: number;
  triggerPrice: Types.Decimal128;
  parentPositionId: Types.ObjectId | null;
  parentStrategyId: Types.ObjectId | null;
  reservedFunds: Types.Decimal128;
  status: 'active' | 'triggered' | 'cancelled' | 'expired';
  timeInForce: 'day' | 'gtc';
  expiresAt: Date | null;
  triggeredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const PendingOrderSchema = new Schema<IPendingOrder>({
  userId: { type: String, required: true, index: true },
  symbol: { type: String, required: true, uppercase: true, index: true },
  side: { type: String, enum: ['BUY', 'SELL'], required: true },
  orderType: { 
    type: String, 
    enum: ['limit', 'stop_loss', 'take_profit', 'market_on_open'], 
    required: true 
  },
  quantity: { type: Number, required: true, min: 1 },
  triggerPrice: { type: Schema.Types.Decimal128, required: true },
  parentPositionId: { type: Schema.Types.ObjectId, ref: 'Position', default: null },
  parentStrategyId: { type: Schema.Types.ObjectId, ref: 'ForwardTestStrategy', default: null },
  reservedFunds: { type: Schema.Types.Decimal128, required: true, default: Types.Decimal128.fromString('0') },
  status: { 
    type: String, 
    enum: ['active', 'triggered', 'cancelled', 'expired'], 
    default: 'active',
    index: true
  },
  timeInForce: { type: String, enum: ['day', 'gtc'], default: 'day' },
  expiresAt: { type: Date, default: null },
  triggeredAt: { type: Date, default: null },
}, {
  timestamps: true,
  toJSON: {
    transform: (_doc, ret) => {
      if (ret.triggerPrice != null) ret.triggerPrice = ret.triggerPrice.toString() as any;
      if (ret.reservedFunds != null) ret.reservedFunds = ret.reservedFunds.toString() as any;
      return ret;
    },
  },
});

PendingOrderSchema.index({ userId: 1, status: 1 });

const PendingOrder = models.PendingOrder || model<IPendingOrder>('PendingOrder', PendingOrderSchema);

export default PendingOrder;
