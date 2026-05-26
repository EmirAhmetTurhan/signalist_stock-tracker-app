// lib/paper-trading/portfolio-metrics.ts — Server-side P&L and performance computation
// Computes portfolio summary, unrealized P&L, realized P&L, and basic performance metrics.

import { connectToDatabase } from '@/database/mongoose';
import Wallet from '@/database/models/wallet.model';
import Position from '@/database/models/position.model';
import Trade from '@/database/models/trade.model';
import { fromDecimal128, decimalSub, decimalMul, decimalDiv, decimalAdd } from './decimal-utils';

// ============================================================
// Types
// ============================================================

export interface PortfolioSummary {
  wallet: {
    cashBalance: number;
    reservedBalance: number;
    initialBalance: number;
    buyingPower: number;
    resetCount: number;
  };
  positions: PositionWithPnl[];
  totalEquity: number; // cash + market value of all positions
  totalUnrealizedPnl: number;
  totalUnrealizedPnlPercent: number;
  totalRealizedPnl: number;
  totalReturn: number; // total equity - initial balance
  totalReturnPercent: number;
  dayPnl: number; // today's trades realized P&L
}

export interface PositionWithPnl {
  id: string;
  symbol: string;
  quantity: number;
  avgEntryPrice: number;
  totalCostBasis: number;
  realizedPnlToDate: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  openedAt: string;
  lastTradeAt: string;
}

export interface TradeRecord {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  fillPrice: number;
  notional: number;
  fees: number;
  realizedPnl: number | null;
  triggerSource: TriggerSource;
  status: TradeStatus;
  executedAt: string;
  createdAt: string;
}

export interface PerformanceMetrics {
  totalReturn: number;
  totalReturnPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  largestWin: number;
  largestLoss: number;
}

// ============================================================
// Portfolio Summary
// ============================================================

export async function getPortfolioSummary(
  userId: string,
  priceMap?: Record<string, number>
): Promise<PortfolioSummary> {
  await connectToDatabase();

  // Fetch wallet
  const wallet = await Wallet.findOne({ userId }).lean();
  if (!wallet) {
    // No wallet yet — return empty portfolio
    return emptyPortfolio();
  }

  const cashBalance = fromDecimal128(wallet.cashBalance);
  const reservedBalance = fromDecimal128(wallet.reservedBalance);
  const initialBalance = fromDecimal128(wallet.initialBalance);

  // Fetch open positions
  const rawPositions = await Position.find({ userId, status: 'open' }).lean();

  // If no price map provided, we return positions without current price
  const positions: PositionWithPnl[] = rawPositions.map((p) => {
    const avgEntry = fromDecimal128(p.avgEntryPrice);
    const costBasis = fromDecimal128(p.totalCostBasis);
    const realizedPnl = fromDecimal128(p.realizedPnlToDate);
    const currentPrice = priceMap?.[p.symbol] || avgEntry; // fallback to avg entry if no price
    const marketValue = decimalMul(currentPrice, p.quantity);
    const unrealizedPnl = decimalMul(decimalSub(currentPrice, avgEntry), p.quantity);
    const unrealizedPnlPercent = avgEntry > 0
      ? decimalMul(decimalDiv(decimalSub(currentPrice, avgEntry), avgEntry), 100)
      : 0;

    return {
      id: String(p._id),
      symbol: p.symbol,
      quantity: p.quantity,
      avgEntryPrice: avgEntry,
      totalCostBasis: costBasis,
      realizedPnlToDate: realizedPnl,
      currentPrice,
      marketValue,
      unrealizedPnl,
      unrealizedPnlPercent: Math.round(unrealizedPnlPercent * 100) / 100,
      openedAt: p.openedAt?.toISOString() || '',
      lastTradeAt: p.lastTradeAt?.toISOString() || '',
    };
  });

  // Calculate totals
  const totalMarketValue = positions.reduce((sum, p) => decimalAdd(sum, p.marketValue), 0);
  const totalUnrealizedPnl = positions.reduce((sum, p) => decimalAdd(sum, p.unrealizedPnl), 0);
  const totalEquity = decimalAdd(cashBalance, decimalAdd(totalMarketValue, reservedBalance));
  const totalReturn = decimalSub(totalEquity, initialBalance);
  const totalReturnPercent = initialBalance > 0
    ? Math.round(decimalMul(decimalDiv(totalReturn, initialBalance), 100) * 100) / 100
    : 0;
  const totalUnrealizedPnlPercent = positions.length > 0
    ? Math.round(decimalDiv(
        totalUnrealizedPnl,
        positions.reduce((sum, p) => decimalAdd(sum, p.totalCostBasis), 0)
      ) * 10000) / 100
    : 0;

  // Today's realized P&L
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const todayTrades = await Trade.find({
    userId,
    executedAt: { $gte: startOfDay },
    status: 'executed',
    realizedPnl: { $ne: null },
  }).lean();
  const dayPnl = todayTrades.reduce((sum, t) => decimalAdd(sum, fromDecimal128(t.realizedPnl)), 0);

  // Total realized P&L from all closed trades
  const allSellTrades = await Trade.find({
    userId,
    side: 'SELL',
    status: 'executed',
    realizedPnl: { $ne: null },
  }).lean();
  const totalRealizedPnl = allSellTrades.reduce((sum, t) => decimalAdd(sum, fromDecimal128(t.realizedPnl)), 0);

  return {
    wallet: {
      cashBalance,
      reservedBalance,
      initialBalance,
      buyingPower: decimalSub(cashBalance, reservedBalance),
      resetCount: wallet.resetCount || 0,
    },
    positions,
    totalEquity: Math.round(totalEquity * 100) / 100,
    totalUnrealizedPnl: Math.round(totalUnrealizedPnl * 100) / 100,
    totalUnrealizedPnlPercent,
    totalRealizedPnl: Math.round(totalRealizedPnl * 100) / 100,
    totalReturn: Math.round(totalReturn * 100) / 100,
    totalReturnPercent,
    dayPnl: Math.round(dayPnl * 100) / 100,
  };
}

// ============================================================
// Trade History
// ============================================================

export async function getTradeHistory(
  userId: string,
  options: { limit?: number; offset?: number; symbol?: string } = {}
): Promise<{ trades: TradeRecord[]; total: number }> {
  await connectToDatabase();

  const { limit = 20, offset = 0, symbol } = options;
  const filter: Record<string, unknown> = { userId, status: 'executed' };
  if (symbol) filter.symbol = symbol.toUpperCase();

  const [trades, total] = await Promise.all([
    Trade.find(filter)
      .sort({ executedAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean(),
    Trade.countDocuments(filter),
  ]);

  return {
    trades: trades.map((t) => ({
      id: String(t._id),
      symbol: t.symbol,
      side: t.side,
      quantity: t.quantity,
      fillPrice: fromDecimal128(t.fillPrice),
      notional: fromDecimal128(t.notional),
      fees: fromDecimal128(t.fees),
      realizedPnl: t.realizedPnl ? fromDecimal128(t.realizedPnl) : null,
      triggerSource: t.triggerSource as TriggerSource,
      status: t.status as TradeStatus,
      executedAt: t.executedAt?.toISOString() || '',
      createdAt: t.createdAt?.toISOString() || '',
    })),
    total,
  };
}

// ============================================================
// Performance Metrics
// ============================================================

export async function getPerformanceMetrics(userId: string): Promise<PerformanceMetrics> {
  await connectToDatabase();

  const sellTrades = await Trade.find({
    userId,
    side: 'SELL',
    status: 'executed',
    realizedPnl: { $ne: null },
  }).lean();

  const totalTrades = sellTrades.length;
  if (totalTrades === 0) {
    return {
      totalReturn: 0, totalReturnPercent: 0,
      totalTrades: 0, winningTrades: 0, losingTrades: 0,
      winRate: 0, avgWin: 0, avgLoss: 0, profitFactor: 0,
      largestWin: 0, largestLoss: 0,
    };
  }

  const pnls = sellTrades.map(t => fromDecimal128(t.realizedPnl));
  const wins = pnls.filter(p => p > 0);
  const losses = pnls.filter(p => p < 0);

  const totalReturn = pnls.reduce((a, b) => decimalAdd(a, b), 0);
  const wallet = await Wallet.findOne({ userId }).lean();
  const initialBalance = wallet ? fromDecimal128(wallet.initialBalance) : 10000;

  const grossWins = wins.reduce((a, b) => decimalAdd(a, b), 0);
  const grossLosses = Math.abs(losses.reduce((a, b) => decimalAdd(a, b), 0));

  return {
    totalReturn: Math.round(totalReturn * 100) / 100,
    totalReturnPercent: Math.round(decimalDiv(totalReturn, initialBalance) * 10000) / 100,
    totalTrades,
    winningTrades: wins.length,
    losingTrades: losses.length,
    winRate: Math.round((wins.length / totalTrades) * 10000) / 100,
    avgWin: wins.length > 0 ? Math.round(decimalDiv(grossWins, wins.length) * 100) / 100 : 0,
    avgLoss: losses.length > 0 ? Math.round(decimalDiv(grossLosses, losses.length) * 100) / 100 : 0,
    profitFactor: grossLosses > 0 ? Math.round(decimalDiv(grossWins, grossLosses) * 100) / 100 : grossWins > 0 ? Infinity : 0,
    largestWin: wins.length > 0 ? Math.round(Math.max(...wins) * 100) / 100 : 0,
    largestLoss: losses.length > 0 ? Math.round(Math.abs(Math.min(...losses)) * 100) / 100 : 0,
  };
}

// ============================================================
// Fetch prices for a list of symbols (batch)
// ============================================================

export async function fetchPriceMap(symbols: string[]): Promise<Record<string, number>> {
  const token = process.env.FINNHUB_API_KEY || '';
  if (!token || symbols.length === 0) return {};

  const priceMap: Record<string, number> = {};
  // Fetch in parallel but limit concurrency
  const results = await Promise.allSettled(
    symbols.map(async (symbol) => {
      try {
        const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`;
        const res = await fetch(url, { cache: 'force-cache', next: { revalidate: 60 } } as RequestInit);
        if (!res.ok) return;
        const data = await res.json() as { c?: number };
        if (data?.c && typeof data.c === 'number' && data.c > 0) {
          priceMap[symbol] = data.c;
        }
      } catch { /* ignore individual failures */ }
    })
  );

  return priceMap;
}

// ============================================================
// Empty portfolio helper
// ============================================================

function emptyPortfolio(): PortfolioSummary {
  return {
    wallet: { cashBalance: 0, reservedBalance: 0, initialBalance: 0, buyingPower: 0, resetCount: 0 },
    positions: [],
    totalEquity: 0,
    totalUnrealizedPnl: 0,
    totalUnrealizedPnlPercent: 0,
    totalRealizedPnl: 0,
    totalReturn: 0,
    totalReturnPercent: 0,
    dayPnl: 0,
  };
}
