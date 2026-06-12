// database/models/transaction.model.ts
import { Schema, model, models, Document, Types } from 'mongoose';

export interface ITransaction extends Document {
  walletId: Types.ObjectId;
  userId: string;
  positionId: Types.ObjectId | null;
  type: 'DEPOSIT' | 'WITHDRAW' | 'BUY' | 'SELL' | 'CORPORATE_ACTION' | 'REVERSAL' | 'FEE';
  subType: 'SPLIT' | 'DIVIDEND' | 'PARTIAL_CLOSE' | 'FULL_CLOSE' | 'OPEN' | null;
  symbol: string | null;
  quantity: Types.Decimal128;
  price: Types.Decimal128;
  amount: Types.Decimal128; // Net impact on cash balance
  fees: Types.Decimal128;
  feeType: 'COMMISSION' | 'SPREAD' | 'REGULATORY' | null;
  costBasis: Types.Decimal128 | null; // Tracked specifically for partial closes
  realizedPnl: Types.Decimal128 | null; // PnL realized in this specific event
  relatedTransactionId: Types.ObjectId | null;
  metadata: Record<string, any>;
  executedAt: Date;
  createdAt: Date;
}

const TransactionSchema = new Schema<ITransaction>({
  walletId: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true, index: true },
  userId: { type: String, required: true, index: true },
  positionId: { type: Schema.Types.ObjectId, ref: 'Position', default: null, index: true },
  type: { type: String, enum: ['DEPOSIT', 'WITHDRAW', 'BUY', 'SELL', 'CORPORATE_ACTION', 'REVERSAL', 'FEE'], required: true },
  subType: { type: String, enum: ['SPLIT', 'DIVIDEND', 'PARTIAL_CLOSE', 'FULL_CLOSE', 'OPEN', null], default: null },
  symbol: { type: String, uppercase: true, default: null, index: true },
  quantity: { type: Schema.Types.Decimal128, required: true },
  price: { type: Schema.Types.Decimal128, required: true },
  amount: { type: Schema.Types.Decimal128, required: true },
  fees: { type: Schema.Types.Decimal128, default: Types.Decimal128.fromString('0') },
  feeType: { type: String, enum: ['COMMISSION', 'SPREAD', 'REGULATORY', null], default: null },
  costBasis: { type: Schema.Types.Decimal128, default: null },
  realizedPnl: { type: Schema.Types.Decimal128, default: null },
  relatedTransactionId: { type: Schema.Types.ObjectId, ref: 'Transaction', default: null },
  metadata: { type: Schema.Types.Mixed, default: {} },
  executedAt: { type: Date, required: true, index: true },
}, {
  timestamps: { createdAt: true, updatedAt: false }, // Immutable ledger, no updates allowed
  toJSON: {
    transform: (_doc, ret: Record<string, unknown>) => {
      if (ret.quantity != null) ret.quantity = String(ret.quantity);
      if (ret.price != null) ret.price = String(ret.price);
      if (ret.amount != null) ret.amount = String(ret.amount);
      if (ret.fees != null) ret.fees = String(ret.fees);
      if (ret.costBasis != null) ret.costBasis = String(ret.costBasis);
      if (ret.realizedPnl != null) ret.realizedPnl = String(ret.realizedPnl);
      return ret;
    }
  }
});

const Transaction = models.Transaction || model<ITransaction>('Transaction', TransactionSchema);
export default Transaction;
