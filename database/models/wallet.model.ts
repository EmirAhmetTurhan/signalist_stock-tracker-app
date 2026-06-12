// database/models/wallet.model.ts
import { Schema, model, models, Document, Types } from 'mongoose';

export interface ICapitalInjection {
  type: 'DEPOSIT' | 'WITHDRAW';
  amount: Types.Decimal128;
  equityBeforeInjection: Types.Decimal128;
  date: Date;
}

export interface IStrategyPortfolioItem {
  originalStrategyId: Types.ObjectId | string;
  weight: number;
  engineVersion: string;
  indicators?: any[];
  bestParams?: any;
  riskProfile?: any;
}

export interface IWallet extends Document {
  userId: string;
  type: 'live' | 'simulation';
  status: 'active' | 'error' | 'suspended';
  lastError?: string;
  baseCurrency: string;
  cashBalance: Types.Decimal128;
  reservedBalance: Types.Decimal128;
  initialBalance: Types.Decimal128;
  totalEquity: Types.Decimal128;
  circuitBreakerTriggered: boolean;
  capitalInjections: ICapitalInjection[];
  strategyPortfolio: IStrategyPortfolioItem[];
  activeSymbols: string[];
  positionSizingConfig: {
    type: 'all_in' | 'fixed_fractional' | 'risk_based' | 'half_kelly';
    value: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const CapitalInjectionSchema = new Schema<ICapitalInjection>({
  type: { type: String, enum: ['DEPOSIT', 'WITHDRAW'], required: true },
  amount: { type: Schema.Types.Decimal128, required: true },
  equityBeforeInjection: { type: Schema.Types.Decimal128, required: true },
  date: { type: Date, required: true },
}, { _id: false });

const StrategyPortfolioItemSchema = new Schema<IStrategyPortfolioItem>({
  originalStrategyId: { type: Schema.Types.ObjectId, required: true },
  weight: { type: Number, required: true },
  engineVersion: { type: String, required: true, default: '1.0.0' },
  indicators: [{ type: Schema.Types.Mixed }],
  bestParams: { type: Schema.Types.Mixed },
  riskProfile: { type: Schema.Types.Mixed }
}, { _id: false });

const WalletSchema = new Schema<IWallet>({
  userId: { type: String, required: true, index: true },
  type: { type: String, enum: ['live', 'simulation'], required: true, default: 'live' },
  status: { type: String, enum: ['active', 'error', 'suspended'], default: 'active' },
  lastError: { type: String },
  baseCurrency: { type: String, default: 'USD' },
  cashBalance: { type: Schema.Types.Decimal128, required: true, default: Types.Decimal128.fromString('0') },
  reservedBalance: { type: Schema.Types.Decimal128, required: true, default: Types.Decimal128.fromString('0') },
  initialBalance: { type: Schema.Types.Decimal128, required: true, default: Types.Decimal128.fromString('0') },
  totalEquity: { type: Schema.Types.Decimal128, required: true, default: Types.Decimal128.fromString('0') },
  circuitBreakerTriggered: { type: Boolean, default: false },
  capitalInjections: [CapitalInjectionSchema],
  strategyPortfolio: [StrategyPortfolioItemSchema],
  activeSymbols: [{ type: String, uppercase: true }],
  positionSizingConfig: {
    type: { type: String, enum: ['all_in', 'fixed_fractional', 'risk_based', 'half_kelly'], default: 'fixed_fractional' },
    value: { type: Number, default: 0.1 }
  }
}, {
  timestamps: true,
  toJSON: {
    transform: (_doc, ret: Record<string, unknown>) => {
      if (ret.cashBalance != null) ret.cashBalance = String(ret.cashBalance);
      if (ret.reservedBalance != null) ret.reservedBalance = String(ret.reservedBalance);
      if (ret.initialBalance != null) ret.initialBalance = String(ret.initialBalance);
      if (ret.totalEquity != null) ret.totalEquity = String(ret.totalEquity);
      if (Array.isArray(ret.capitalInjections)) {
        ret.capitalInjections = ret.capitalInjections.map((ci: any) => ({
          ...ci,
          amount: String(ci.amount),
          equityBeforeInjection: String(ci.equityBeforeInjection)
        }));
      }
      if (Array.isArray(ret.strategyPortfolio)) {
        ret.strategyPortfolio = ret.strategyPortfolio.map((sp: any) => ({
          ...sp,
          originalStrategyId: String(sp.originalStrategyId)
        }));
      }
      return ret;
    }
  }
});

WalletSchema.index({ userId: 1, type: 1 });

const Wallet = models.Wallet || model<IWallet>('Wallet', WalletSchema);
export default Wallet;
