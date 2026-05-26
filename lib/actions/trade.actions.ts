'use server';

// lib/actions/trade.actions.ts — Trade execution & history server actions
// All trade mutations go through the execution engine. This file is the RPC surface.

import { connectToDatabase } from '@/database/mongoose';
import Position from '@/database/models/position.model';
import { executeTrade, type TradeInput } from '@/lib/paper-trading/execution-engine';
import {
  getPortfolioSummary,
  getTradeHistory as getTradeHistoryInternal,
  getPerformanceMetrics as getPerformanceMetricsInternal,
  fetchPriceMap,
  type PortfolioSummary,
  type TradeRecord,
  type PerformanceMetrics,
} from '@/lib/paper-trading/portfolio-metrics';
import { fromDecimal128 } from '@/lib/paper-trading/decimal-utils';
import { createPendingOrder } from './pending-orders.actions';
import { randomUUID } from 'crypto';

// ============================================================
// Execute Manual Trade
// ============================================================

export async function executeManualTrade(input: {
  userId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  clientRequestId: string;
}) {
  const { userId, symbol, side, quantity, clientRequestId } = input;

  if (!userId) return { success: false, error: 'Oturum bulunamadı. Lütfen giriş yapın.' };
  if (!symbol) return { success: false, error: 'Hisse sembolü gerekli.' };
  if (!side || !['BUY', 'SELL'].includes(side)) return { success: false, error: 'Geçersiz işlem yönü.' };
  if (!quantity || quantity <= 0 || !Number.isInteger(quantity)) {
    return { success: false, error: 'Adet pozitif bir tamsayı olmalıdır.' };
  }
  if (!clientRequestId) return { success: false, error: 'İstemci istek kimliği gerekli.' };

  const result = await executeTrade({
    userId,
    symbol: symbol.toUpperCase(),
    side,
    quantity,
    clientRequestId,
    triggerSource: 'manual',
  });

  if (!result.success && result.errorCode === 'MARKET_CLOSED') {
    // Attempt to convert to pending order
    try {
      const priceMap = await fetchPriceMap([symbol.toUpperCase()]);
      const currentPrice = priceMap[symbol.toUpperCase()] || 0;

      if (currentPrice > 0) {
        const pendingRes = await createPendingOrder({
          userId,
          symbol: symbol.toUpperCase(),
          side,
          orderType: 'market_on_open',
          quantity,
          triggerPrice: currentPrice,
        });

        if (pendingRes.success) {
          return { 
            success: true, 
            userMessage: 'Piyasa kapalı olduğu için işleminiz piyasa açılış emri (Market on Open) olarak kaydedildi.' 
          };
        }
      }
    } catch (e) {
      console.error('Failed to convert to pending order:', e);
    }
  }

  return result;
}

// ============================================================
// Get Portfolio Data (for page load)
// ============================================================

export async function getPortfolioData(userId: string): Promise<{
  success: boolean;
  data?: PortfolioSummary;
  error?: string;
}> {
  if (!userId) return { success: false, error: 'Oturum bulunamadı.' };

  try {
    await connectToDatabase();

    // Get open position symbols to fetch prices
    const openPositions = await Position.find({ userId, status: 'open' }).lean();
    const symbols = openPositions.map(p => p.symbol);

    // Fetch current prices for all open positions
    const priceMap = await fetchPriceMap(symbols);

    // Get full portfolio summary with prices
    const summary = await getPortfolioSummary(userId, priceMap);

    return { success: true, data: summary };
  } catch (e) {
    console.error('[TradeActions] getPortfolioData error:', e);
    return { success: false, error: 'Portföy verileri yüklenirken bir hata oluştu.' };
  }
}

// ============================================================
// Get Open Positions (with current prices)
// ============================================================

export async function getOpenPositions(userId: string): Promise<{
  success: boolean;
  positions?: Array<{
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
  }>;
  error?: string;
}> {
  if (!userId) return { success: false, error: 'Oturum bulunamadı.' };

  try {
    await connectToDatabase();

    const positions = await Position.find({ userId, status: 'open' }).lean();
    const symbols = positions.map(p => p.symbol);
    const priceMap = await fetchPriceMap(symbols);

    const enriched = positions.map(p => {
      const avgEntry = fromDecimal128(p.avgEntryPrice);
      const currentPrice = priceMap[p.symbol] || avgEntry;
      const marketValue = currentPrice * p.quantity;
      const unrealizedPnl = (currentPrice - avgEntry) * p.quantity;
      const unrealizedPnlPercent = avgEntry > 0 ? ((currentPrice - avgEntry) / avgEntry) * 100 : 0;

      return {
        id: String(p._id),
        symbol: p.symbol,
        quantity: p.quantity,
        avgEntryPrice: Math.round(avgEntry * 100) / 100,
        totalCostBasis: Math.round(fromDecimal128(p.totalCostBasis) * 100) / 100,
        realizedPnlToDate: Math.round(fromDecimal128(p.realizedPnlToDate) * 100) / 100,
        currentPrice: Math.round(currentPrice * 100) / 100,
        marketValue: Math.round(marketValue * 100) / 100,
        unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
        unrealizedPnlPercent: Math.round(unrealizedPnlPercent * 100) / 100,
        openedAt: p.openedAt?.toISOString() || '',
      };
    });

    return { success: true, positions: enriched };
  } catch (e) {
    console.error('[TradeActions] getOpenPositions error:', e);
    return { success: false, error: 'Pozisyonlar yüklenirken bir hata oluştu.' };
  }
}

// ============================================================
// Get Trade History
// ============================================================

export async function getTradeHistoryAction(
  userId: string,
  options?: { limit?: number; offset?: number; symbol?: string }
): Promise<{
  success: boolean;
  trades?: TradeRecord[];
  total?: number;
  error?: string;
}> {
  if (!userId) return { success: false, error: 'Oturum bulunamadı.' };

  try {
    const result = await getTradeHistoryInternal(userId, options);
    return { success: true, trades: result.trades, total: result.total };
  } catch (e) {
    console.error('[TradeActions] getTradeHistory error:', e);
    return { success: false, error: 'İşlem geçmişi yüklenirken bir hata oluştu.' };
  }
}

// ============================================================
// Get Performance Metrics
// ============================================================

export async function getPerformanceMetricsAction(userId: string): Promise<{
  success: boolean;
  metrics?: PerformanceMetrics;
  error?: string;
}> {
  if (!userId) return { success: false, error: 'Oturum bulunamadı.' };

  try {
    const metrics = await getPerformanceMetricsInternal(userId);
    return { success: true, metrics };
  } catch (e) {
    console.error('[TradeActions] getPerformanceMetrics error:', e);
    return { success: false, error: 'Performans metrikleri yüklenirken bir hata oluştu.' };
  }
}
