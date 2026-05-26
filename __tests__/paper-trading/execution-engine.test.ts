import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeTrade } from '@/lib/paper-trading/execution-engine';
import Wallet from '@/database/models/wallet.model';
import Position from '@/database/models/position.model';
import Trade from '@/database/models/trade.model';
import mongoose from 'mongoose';
import * as mongooseConnection from '@/database/mongoose';
import { toDecimal128 } from '@/lib/paper-trading/decimal-utils';

vi.mock('@/database/mongoose', () => ({
  connectToDatabase: vi.fn(),
}));

vi.mock('@/database/models/wallet.model');
vi.mock('@/database/models/position.model');
vi.mock('@/database/models/trade.model');

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
    
    // No existing position
    (Position.findOne as any).mockResolvedValue(null);
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
    (Position.findOne as any).mockResolvedValue(existingPos);
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
    (Position.findOne as any).mockResolvedValue(existingPos);
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
