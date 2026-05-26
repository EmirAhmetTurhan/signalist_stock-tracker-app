// database/models/wallet.model.ts — Paper Trading Wallet
// Separate from User (Better Auth owns that schema).
// Uses Decimal128 for all money fields to prevent JS floating-point corruption.

import { Schema, model, models, Document, Types } from 'mongoose';

export interface IWallet extends Document {
  userId: string;
  currency: 'USD';
  cashBalance: Types.Decimal128;
  reservedBalance: Types.Decimal128;
  initialBalance: Types.Decimal128;
  resetCount: number;
  lastResetAt: Date | null;
  maxPositionPercent: number;
  maxOpenPositions: number;
  maxDailyLossPercent: number;
  circuitBreakerTriggered: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const WalletSchema = new Schema<IWallet>({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  currency: {
    type: String,
    enum: ['USD'],
    default: 'USD',
  },
  cashBalance: {
    type: Schema.Types.Decimal128,
    required: true,
    default: Types.Decimal128.fromString('10000'),
  },
  reservedBalance: {
    type: Schema.Types.Decimal128,
    required: true,
    default: Types.Decimal128.fromString('0'),
  },
  initialBalance: {
    type: Schema.Types.Decimal128,
    required: true,
    default: Types.Decimal128.fromString('10000'),
  },
  resetCount: {
    type: Number,
    default: 0,
  },
  lastResetAt: {
    type: Date,
    default: null,
  },
  maxPositionPercent: {
    type: Number,
    default: 20,
  },
  maxOpenPositions: {
    type: Number,
    default: 10,
  },
  maxDailyLossPercent: {
    type: Number,
    default: 5,
  },
  circuitBreakerTriggered: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
  // Transform Decimal128 to string in JSON output for API responses
  toJSON: {
    transform: (_doc, ret) => {
      if (ret.cashBalance) ret.cashBalance = ret.cashBalance.toString() as any;
      if (ret.reservedBalance) ret.reservedBalance = ret.reservedBalance.toString() as any;
      if (ret.initialBalance) ret.initialBalance = ret.initialBalance.toString() as any;
      return ret;
    },
  },
});

const Wallet = models.Wallet || model<IWallet>('Wallet', WalletSchema);

export default Wallet;
