// lib/paper-trading/execution-engine.ts — The SINGLE funnel for ALL trade executions
// Whether called from manual UI, AI proposal, strategy, or limit-order trigger — all paths converge here.
// Three-layer protection: atomic conditional update + MongoDB transaction + idempotency keys.

import { connectToDatabase } from '@/database/mongoose';
import Wallet from '@/database/models/wallet.model';
import Trade from '@/database/models/trade.model';
import Position from '@/database/models/position.model';
import Notification from '@/database/models/notification.model';
import PendingOrder from '@/database/models/pending-order.model';
import {
  toDecimal128,
  fromDecimal128,
  decimalMul,
  decimalAdd,
  decimalSub,
  weightedAvgPrice,
  DEFAULT_SLIPPAGE_BPS,
  DEFAULT_COMMISSION,
  MAX_QUOTE_STALENESS_SECONDS,
} from './decimal-utils';
import { getPortfolioSummary } from './portfolio-metrics';
import { cleanupDanglingOrders } from '@/lib/actions/pending-orders.actions';
import { isMarketOpen } from '@/lib/constants/market-calendar';
import mongoose from 'mongoose';

const MAX_PRICE_DEVIATION_PERCENT = 50; // Max 50% deviation from previous close


// ============================================================
// Types
// ============================================================

export interface TradeInput {
  userId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  clientRequestId: string;
  triggerSource: 'manual' | 'ai_proposal' | 'strategy' | 'limit_order' | 'stop_loss' | 'take_profit' | 'corporate_action';
  triggerContext?: {
    strategyId?: string;
    signalSnapshot?: Record<string, unknown>;
    aiConversationId?: string;
    aiMessageId?: string;
  };
  slippageBps?: number;
  commission?: number;
  skipMarketHoursCheck?: boolean;
  useReservedFunds?: boolean;
}

export interface TradeResult {
  success: boolean;
  trade?: Record<string, unknown>;
  error?: string;
  errorCode?: string;
  userMessage?: string;
  recoverable?: boolean;
}

// ============================================================
// Helpers
// ============================================================

/** Fetch a fresh quote from Finnhub. Returns { price, previousClose, timestamp } or throws. */
async function fetchFreshQuote(symbol: string): Promise<{ price: number; previousClose: number; timestamp: number }> {
  const token = process.env.FINNHUB_API_KEY || '';
  if (!token) throw new Error('FINNHUB_API_KEY not configured');

  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Quote fetch failed ${res.status}: ${text}`);
  }

  const data = await res.json() as { c?: number; pc?: number; t?: number };
  if (!data || typeof data.c !== 'number' || data.c <= 0) {
    throw new Error(`Invalid quote data for ${symbol}`);
  }

  return {
    price: data.c,
    previousClose: data.pc || data.c, // fallback to current if missing
    timestamp: (data.t || Math.floor(Date.now() / 1000)),
  };
}

/** Apply simulated slippage to a quote price. */
function applySlippage(price: number, side: 'BUY' | 'SELL', slippageBps: number): number {
  const factor = slippageBps / 10000;
  // Buyers get worse price (higher), sellers get worse price (lower)
  if (side === 'BUY') {
    return decimalMul(price, 1 + factor);
  }
  return decimalMul(price, 1 - factor);
}

// ============================================================
// MAIN EXECUTION FUNCTION
// ============================================================

export async function executeTrade(input: TradeInput): Promise<TradeResult> {
  const {
    userId,
    symbol,
    side,
    quantity,
    clientRequestId,
    triggerSource,
    triggerContext = {},
    slippageBps = DEFAULT_SLIPPAGE_BPS,
    commission = DEFAULT_COMMISSION,
    skipMarketHoursCheck = false,
    useReservedFunds = false,
  } = input;

  // --- Validation ---
  if (!userId) return tradeError('INTERNAL_ERROR', 'Kullanıcı kimliği eksik.');
  if (!symbol || symbol.length > 10) return tradeError('INVALID_SYMBOL', `Geçersiz hisse sembolü: ${symbol}`);
  if (!Number.isInteger(quantity) || quantity <= 0) return tradeError('INVALID_QUANTITY', 'Adet pozitif bir tamsayı olmalıdır.');

  if (triggerSource === 'strategy' && process.env.AUTO_EXECUTION_ENABLED !== 'true') {
    return tradeError('AUTO_EXECUTION_DISABLED', 'Otomatik işlem şu anda sistem tarafından devre dışı bırakılmıştır.');
  }

  await connectToDatabase();

  // --- Step 1: Idempotency check ---
  const existingTrade = await Trade.findOne({ clientRequestId }).lean();
  if (existingTrade) {
    // Duplicate request — return existing trade
    return { success: true, trade: existingTrade as Record<string, unknown> };
  }

  // --- Step 2: Fetch fresh quote ---
  let quotePrice: number;
  let previousClose: number;
  let quoteTimestamp: number;
  try {
    const quote = await fetchFreshQuote(symbol);
    quotePrice = quote.price;
    previousClose = quote.previousClose;
    quoteTimestamp = quote.timestamp;
  } catch (e) {
    return tradeError('STALE_QUOTE', `${symbol} için güncel fiyat alınamadı: ${e instanceof Error ? e.message : String(e)}`);
  }

  // --- Step 3: Market Hours Check ---
  const marketOpen = isMarketOpen();

  if (!marketOpen && !skipMarketHoursCheck) {
    return tradeError('MARKET_CLOSED', 'Piyasa şu anda kapalı.');
  }

  const quoteAge = Math.floor(Date.now() / 1000) - quoteTimestamp;
  if (marketOpen && quoteAge > MAX_QUOTE_STALENESS_SECONDS) {
    return tradeError('STALE_QUOTE', `Fiyat verisi çok eski (${quoteAge}s). Lütfen tekrar deneyin.`);
  }

  // --- Step 4: Price deviation guard ---
  // Catch bad ticks by comparing quote against previous close
  if (previousClose > 0) {
    const deviationPercent = Math.abs((quotePrice - previousClose) / previousClose) * 100;
    if (deviationPercent > MAX_PRICE_DEVIATION_PERCENT) {
      return tradeError(
        'PRICE_DEVIATION_TOO_HIGH',
        `${symbol} için fiyat sapması çok yüksek (%${deviationPercent.toFixed(1)}). Bu geçici bir veri hatası olabilir, lütfen tekrar deneyin.`
      );
    }
  }

  // --- Step 5: Apply slippage simulation ---
  const fillPrice = applySlippage(quotePrice, side, slippageBps);
  const fees = commission;
  const notional = decimalAdd(decimalMul(fillPrice, quantity), fees);

  // --- Step 5.5: Risk Caps Enforcement ---
  const wallet = await Wallet.findOne({ userId }).lean();
  if (!wallet) return tradeError('INTERNAL_ERROR', 'Cüzdan bulunamadı.');

  if (side === 'BUY') {
    if (wallet.circuitBreakerTriggered) {
      return tradeError('CIRCUIT_BREAKER', 'Günlük zarar limitine ulaşıldı. Yeni alımlar geçici olarak durduruldu.');
    }

    const existingPosition = await Position.findOne({ userId, symbol: symbol.toUpperCase(), status: 'open' }).lean();
    if (!existingPosition) {
      // It's a new position -> check maxOpenPositions
      const openCount = await Position.countDocuments({ userId, status: 'open' });
      const pendingBuyCount = await PendingOrder.countDocuments({ userId, side: 'BUY', status: 'active' });
      if (openCount + pendingBuyCount >= (wallet.maxOpenPositions || 10)) {
        return tradeError('POSITION_LIMIT_EXCEEDED', `Maksimum pozisyon limitine (${wallet.maxOpenPositions}) ulaştınız.`);
      }
    }

    const portfolio = await getPortfolioSummary(userId);
    const maxExposure = decimalMul(portfolio.totalEquity, (wallet.maxPositionPercent || 20) / 100);
    const currentExposure = existingPosition ? decimalMul(existingPosition.quantity, fillPrice) : 0;
    
    if (decimalAdd(currentExposure, notional) > maxExposure) {
      return tradeError('POSITION_LIMIT_EXCEEDED', `Bu işlem ile pozisyon büyüklüğünüz izin verilen maksimum değeri (${wallet.maxPositionPercent}%) aşacaktır.`);
    }
  }

  // --- Step 6: Execute transaction ---
  // Try MongoDB transaction first, fall back to non-transactional if not on replica set
  const now = new Date();
  let session: mongoose.ClientSession | null = null;
  let useTransaction = true;

  try {
    session = await mongoose.startSession();
    session.startTransaction();
  } catch {
    // Not on a replica set — proceed without transaction
    // The atomic conditional update (Layer 1) still protects against double-spend
    useTransaction = false;
    session = null;
  }

  try {
    const sessionOpt = useTransaction && session ? { session } : {};

    if (side === 'BUY') {
      // --- BUY FLOW ---

      // Layer 1: Atomic conditional debit (covers 95% of race conditions)
      const walletUpdate = await Wallet.findOneAndUpdate(
        useReservedFunds 
          ? { userId, reservedBalance: { $gte: toDecimal128(notional) } }
          : { userId, cashBalance: { $gte: toDecimal128(notional) } },
        useReservedFunds
          ? { $inc: { reservedBalance: toDecimal128(-notional) } }
          : { $inc: { cashBalance: toDecimal128(-notional) } },
        { returnDocument: 'after', ...sessionOpt }
      );

      if (!walletUpdate) {
        if (useTransaction && session) await session.abortTransaction();
        return tradeError('INSUFFICIENT_FUNDS', `Yetersiz bakiye. Bu işlem için $${notional.toFixed(2)} gerekli.`);
      }

      // Upsert position: if open position exists for this symbol, update it
      const existingPosition = await Position.findOne(
        { userId, symbol: symbol.toUpperCase(), status: 'open' },
        null,
        sessionOpt
      );

      let positionId: mongoose.Types.ObjectId;

      if (existingPosition) {
        // Update existing position with weighted average
        const oldQty = existingPosition.quantity;
        const oldAvg = fromDecimal128(existingPosition.avgEntryPrice);
        const newAvg = weightedAvgPrice(oldQty, oldAvg, quantity, fillPrice);
        const newQty = oldQty + quantity;
        const newCostBasis = decimalAdd(fromDecimal128(existingPosition.totalCostBasis), notional);

        await Position.updateOne(
          { _id: existingPosition._id },
          {
            $set: {
              quantity: newQty,
              avgEntryPrice: toDecimal128(newAvg),
              totalCostBasis: toDecimal128(newCostBasis),
              lastTradeAt: now,
            },
          },
          sessionOpt
        );
        positionId = existingPosition._id as mongoose.Types.ObjectId;
      } else {
        // Create new position
        const [newPosition] = await Position.create([{
          userId,
          symbol: symbol.toUpperCase(),
          status: 'open',
          quantity,
          avgEntryPrice: toDecimal128(fillPrice),
          totalCostBasis: toDecimal128(notional),
          realizedPnlToDate: toDecimal128(0),
          openedAt: now,
          lastTradeAt: now,
        }], sessionOpt);
        positionId = newPosition._id as mongoose.Types.ObjectId;
      }

      // Insert trade record
      const [tradeDoc] = await Trade.create([{
        userId,
        positionId,
        clientRequestId,
        symbol: symbol.toUpperCase(),
        side: 'BUY',
        quantity,
        fillPrice: toDecimal128(fillPrice),
        notional: toDecimal128(notional),
        fees: toDecimal128(fees),
        realizedPnl: null,
        triggerSource,
        triggerContext: {
          ...triggerContext,
          quoteSourceTimestamp: new Date(quoteTimestamp * 1000),
          slippageBps,
        },
        status: 'executed',
        executedAt: now,
      }], sessionOpt);

      if (useTransaction && session) await session.commitTransaction();

      // Fire notification for non-manual sources
      if (triggerSource !== 'manual') {
        await createTradeNotification(userId, 'BUY', symbol, quantity, fillPrice);
      }

      return { success: true, trade: tradeDoc.toJSON() };

    } else {
      // --- SELL FLOW ---

      // Find the open position and validate quantity
      const existingPosition = await Position.findOne(
        { userId, symbol: symbol.toUpperCase(), status: 'open' },
        null,
        sessionOpt
      );

      const qtyToCheck = useReservedFunds ? existingPosition?.reservedQuantity : existingPosition?.quantity;

      if (!existingPosition || (qtyToCheck || 0) < quantity) {
        if (useTransaction && session) await session.abortTransaction();
        const currentQty = existingPosition?.quantity || 0;
        return tradeError(
          'INVALID_POSITION',
          `${symbol} için yetersiz pozisyon. Mevcut: ${currentQty} adet, satılmak istenen: ${quantity} adet.`
        );
      }

      // Calculate realized P&L for this sell
      const avgEntry = fromDecimal128(existingPosition.avgEntryPrice);
      const realizedPnl = decimalMul(decimalSub(fillPrice, avgEntry), quantity);
      const proceeds = decimalSub(decimalMul(fillPrice, quantity), fees);

      // Credit wallet
      await Wallet.findOneAndUpdate(
        { userId },
        { $inc: { cashBalance: toDecimal128(proceeds) } },
        { returnDocument: 'after', ...sessionOpt }
      );

      // Update position
      const newQty = existingPosition.quantity - quantity;
      const isFullClose = newQty === 0;
      const cumulativePnl = decimalAdd(fromDecimal128(existingPosition.realizedPnlToDate), realizedPnl);

      const positionUpdateQuery: any = {
        quantity: newQty,
        realizedPnlToDate: toDecimal128(cumulativePnl),
        lastTradeAt: now,
      };

      if (useReservedFunds) {
        positionUpdateQuery.reservedQuantity = existingPosition.reservedQuantity - quantity;
      }

      await Position.updateOne(
        { _id: existingPosition._id },
        {
          $set: {
            ...positionUpdateQuery,
            ...(isFullClose ? {
              status: 'closed',
              closedAt: now,
              closeReason: triggerSource === 'manual' ? 'user_sell'
                : triggerSource === 'stop_loss' ? 'stop_loss'
                : triggerSource === 'take_profit' ? 'take_profit'
                : triggerSource === 'strategy' ? 'strategy_exit'
                : 'user_sell',
            } : {}),
          },
        },
        sessionOpt
      );

      // Insert trade record
      const positionIdForTrade = isFullClose ? null : existingPosition._id;
      const [tradeDoc] = await Trade.create([{
        userId,
        positionId: positionIdForTrade,
        clientRequestId,
        symbol: symbol.toUpperCase(),
        side: 'SELL',
        quantity,
        fillPrice: toDecimal128(fillPrice),
        notional: toDecimal128(decimalMul(fillPrice, quantity)),
        fees: toDecimal128(fees),
        realizedPnl: toDecimal128(realizedPnl),
        triggerSource,
        triggerContext: {
          ...triggerContext,
          quoteSourceTimestamp: new Date(quoteTimestamp * 1000),
          slippageBps,
        },
        status: 'executed',
        executedAt: now,
      }], sessionOpt);

      if (useTransaction && session) await session.commitTransaction();

      if (isFullClose) {
        // Fire & forget cleanup for dangling SL/TP orders
        cleanupDanglingOrders(String(existingPosition._id), userId).catch(console.error);
      }

      // Fire notification for non-manual sources
      if (triggerSource !== 'manual') {
        await createTradeNotification(userId, 'SELL', symbol, quantity, fillPrice, realizedPnl);
      }

      return { success: true, trade: tradeDoc.toJSON() };
    }
  } catch (e) {
    // Rollback on any error
    if (useTransaction && session) {
      try { await session.abortTransaction(); } catch { /* ignore abort errors */ }
    }

    const errMsg = e instanceof Error ? e.message : String(e);
    console.error('[ExecutionEngine] Trade failed:', errMsg);

    // Map known errors
    if (errMsg.includes('duplicate key') && errMsg.includes('clientRequestId')) {
      // Race condition: another concurrent request already inserted this trade
      const existing = await Trade.findOne({ clientRequestId }).lean();
      if (existing) return { success: true, trade: existing as Record<string, unknown> };
    }

    return tradeError('INTERNAL_ERROR', `İşlem sırasında bir hata oluştu: ${errMsg.slice(0, 200)}`);
  } finally {
    if (session) session.endSession();
  }
}

// ============================================================
// Error helpers
// ============================================================

function tradeError(errorCode: string, userMessage: string): TradeResult {
  const recoverable = ['INSUFFICIENT_FUNDS', 'STALE_QUOTE', 'MARKET_CLOSED'].includes(errorCode);
  return {
    success: false,
    error: userMessage,
    errorCode,
    userMessage,
    recoverable,
  };
}

async function createTradeNotification(
  userId: string,
  side: 'BUY' | 'SELL',
  symbol: string,
  quantity: number,
  fillPrice: number,
  realizedPnl?: number
) {
  try {
    await connectToDatabase();
    const pnlText = realizedPnl !== undefined ? ` (P&L: $${realizedPnl.toFixed(2)})` : '';
    await Notification.create({
      userId,
      type: 'ai_job_completed',
      title: `Paper Trade ${side === 'BUY' ? 'Alım' : 'Satım'} Gerçekleşti`,
      message: `${symbol} — ${quantity} adet @ $${fillPrice.toFixed(2)}${pnlText}`,
    });
  } catch (e) {
    console.error('[ExecutionEngine] Failed to create notification:', e);
  }
}
