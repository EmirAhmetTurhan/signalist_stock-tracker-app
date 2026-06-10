import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeTrade } from '@/lib/paper-trading/execution-engine';
import Wallet from '@/database/models/wallet.model';
import Position from '@/database/models/position.model';
import Trade from '@/database/models/trade.model';
import PendingOrder from '@/database/models/pending-order.model';
import mongoose from 'mongoose';
import * as mongooseConnection from '@/database/mongoose';
import { toDecimal128 } from '@/lib/paper-trading/decimal-utils';

vi.mock('@/database/mongoose', () => ({
  connectToDatabase: vi.fn(),
}));

vi.mock('@/lib/constants/market-calendar', () => ({
  isMarketOpen: () => true,
}));

vi.mock('@/database/models/wallet.model');
vi.mock('@/database/models/position.model');
vi.mock('@/database/models/trade.model');
vi.mock('@/database/models/pending-order.model');

// Mock portfolio-metrics to avoid real DB queries in getPortfolioSummary
vi.mock('@/lib/paper-trading/portfolio-metrics', () => ({
  getPortfolioSummary: vi.fn().mockResolvedValue({
    totalEquity: 10000,
    cashBalance: 8500,
    reservedBalance: 0,
    initialBalance: 10000,
    totalMarketValue: 1500,
    totalUnrealizedPnl: 0,
    totalRealizedPnl: 0,
    totalUnrealizedPnlPercent: 0,
    openCount: 0,
    positions: [],
    totalPnl: 0,
    totalPnlPercent: 0,
    dailyPnl: 0,
    dailyPnlPercent: 0,
  }),
}));

// Mock Finnhub fetch
global.fetch = vi.fn();

describe('Execution Engine', () => {
  const defaultInput = {
    userId: 'user1',
    symbol: 'AAPL',
    side: 'BUY' as const,
    quantity: 10,
    clientRequestId: 'req1',
    triggerSource: 'manual' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    process.env.FINNHUB_API_KEY = 'test_key';

    // Default fetch mock returning a valid quote
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ c: 150, pc: 149, t: Math.floor(Date.now() / 1000) }),
    });

    // Mock mongoose transaction session
    const mockSession = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn(),
      endSession: vi.fn(),
    };
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession as any);

    // Default Wallet.findOne().lean() mock (circuit breaker check + wallet fetch)
    (Wallet.findOne as any).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        userId: 'user1',
        cashBalance: toDecimal128(10000),
        initialBalance: toDecimal128(10000),
        maxDailyLossPercent: 5,
        maxOpenPositions: 10,
        maxPositionPercent: 20,
        circuitBreakerTriggered: false,
      })
    });
  });

  it('rejects trades that deviate >20% from previous close', async () => {
    // Quote is 200, prev close is 100 (100% deviation)
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ c: 200, pc: 100, t: Math.floor(Date.now() / 1000) }),
    });

    // Trade.findOne returns null (no duplicate)
    (Trade.findOne as any).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    const result = await executeTrade(defaultInput);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('PRICE_DEVIATION_TOO_HIGH');
  });

  it('returns INSUFFICIENT_FUNDS if wallet debit fails', async () => {
    (Trade.findOne as any).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    // No existing position
    (Position.findOne as any).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    // Wallet debit returns null meaning conditions not met
    (Wallet.findOneAndUpdate as any).mockResolvedValue(null);

    const result = await executeTrade(defaultInput);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('INSUFFICIENT_FUNDS');

    // Make sure we didn't insert trade or position
    expect(Position.updateOne).not.toHaveBeenCalled();
    expect(Trade.create).not.toHaveBeenCalled();
  });

  it('Concurrent BUY with same clientRequestId returns existing trade', async () => {
    // Existing trade found
    const existing = { _id: 'trade1', clientRequestId: 'req1' };
    (Trade.findOne as any).mockReturnValue({ lean: vi.fn().mockResolvedValue(existing) });

    const result = await executeTrade(defaultInput);
    expect(result.success).toBe(true);
    expect(result.trade).toEqual(existing);
    expect(Wallet.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('Successful BUY creates position and trade', async () => {
    (Trade.findOne as any).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    (Wallet.findOneAndUpdate as any).mockResolvedValue({ cashBalance: toDecimal128(10000) });

    // No existing position — Position.findOne is called TWICE in the BUY flow:
    //   1. L204: Position.findOne(query).lean()       → needs { lean: fn() } wrapper
    //   2. L262: Position.findOne(query, null, sessionOpt) → needs null directly (no .lean() call)
    (Position.findOne as any)
      .mockReturnValueOnce({ lean: vi.fn().mockResolvedValue(null) })
      .mockReturnValueOnce(null);
    (Position.create as any).mockResolvedValue([{ _id: 'pos1' }]);
    (Trade.create as any).mockResolvedValue([{ _id: 'trade1', toJSON: () => ({ id: 'trade1' }) }]);

    const result = await executeTrade(defaultInput);

    expect(result.success).toBe(true);
    expect(Position.create).toHaveBeenCalled();
    expect(Trade.create).toHaveBeenCalled();
  });

  it('Successful SELL updates position quantity and credits wallet', async () => {
    (Trade.findOne as any).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    const existingPos = {
      _id: 'pos1',
      quantity: 15,
      avgEntryPrice: toDecimal128(100),
      totalCostBasis: toDecimal128(1500),
      realizedPnlToDate: toDecimal128(0),
    };
    // SELL flow calls Position.findOne ONCE at L342 without .lean() — return position data directly
    (Position.findOne as any).mockReturnValue(existingPos);
    (Position.updateOne as any).mockResolvedValue({ modifiedCount: 1 });
    (Wallet.findOneAndUpdate as any).mockResolvedValue({ cashBalance: toDecimal128(10000) });
    (Trade.create as any).mockResolvedValue([{ _id: 'trade1', toJSON: () => ({ id: 'trade1' }) }]);

    const result = await executeTrade({ ...defaultInput, side: 'SELL', quantity: 5 });

    expect(result.success).toBe(true);
    expect(Wallet.findOneAndUpdate).toHaveBeenCalled(); // Credited wallet
    expect(Position.updateOne).toHaveBeenCalled(); // Deducted quantity
  });

  it('Full SELL transitions position to closed', async () => {
    (Trade.findOne as any).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    const existingPos = {
      _id: 'pos1',
      quantity: 10,
      avgEntryPrice: toDecimal128(100),
      totalCostBasis: toDecimal128(1000),
      realizedPnlToDate: toDecimal128(0),
    };
    // SELL flow calls Position.findOne ONCE at L342 without .lean() — return position data directly
    (Position.findOne as any).mockReturnValue(existingPos);
    (Position.updateOne as any).mockResolvedValue({ modifiedCount: 1 });
    (Wallet.findOneAndUpdate as any).mockResolvedValue({ cashBalance: toDecimal128(10000) });
    (Trade.create as any).mockResolvedValue([{ _id: 'trade1', toJSON: () => ({ id: 'trade1' }) }]);

    const result = await executeTrade({ ...defaultInput, side: 'SELL', quantity: 10 });

    expect(result.success).toBe(true);

    // Check that updateOne sets status: 'closed'
    const updateCall = (Position.updateOne as any).mock.calls[0];
    expect(updateCall[1].$set.status).toBe('closed');
    expect(updateCall[1].$set.quantity).toBe(0);
  });
});
