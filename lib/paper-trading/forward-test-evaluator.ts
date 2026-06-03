import { connectToDatabase } from '@/database/mongoose';
import ForwardTestStrategy from '@/database/models/forward-test-strategy.model';
import Position from '@/database/models/position.model';
import Wallet from '@/database/models/wallet.model';
import Trade from '@/database/models/trade.model';
import { getDailyCandlesForAI, get4HourCandles } from '@/lib/actions/finnhub.actions';
import { computeIndicators, parseActiveIndicators } from '@/lib/ta/compute';
import type { Timeframe } from '@/lib/ta/types';
import { evaluateRule } from './strategy-evaluator-utils';
import { executeTrade } from './execution-engine';
import { createPendingOrder } from '@/lib/actions/pending-orders.actions';
import { fromDecimal128, toDecimal128, decimalAdd, decimalSub, decimalMul } from './decimal-utils';
import { randomUUID } from 'crypto';

export async function evaluateForwardTests(interval: Timeframe) {
  await connectToDatabase();

  // 1. Fetch all running strategies for this interval
  const strategies = await ForwardTestStrategy.find({ status: 'running', interval }).lean();
  if (!strategies.length) return { executed: 0 };

  // 2. Group by symbol to minimize API calls
  const symbolMap = new Map<string, typeof strategies>();
  for (const strategy of strategies) {
    if (!symbolMap.has(strategy.symbol)) symbolMap.set(strategy.symbol, []);
    symbolMap.get(strategy.symbol)!.push(strategy);
  }

  let executedCount = 0;
  const now = new Date();

  // 3. IDEMPOTENCY GUARD: Aynı evaluation cycle'ında aynı strateji+action
  //    ikinci kez tetiklenirse skip et. Partial failure / re-entry durumlarında
  //    double execution'ı engeller. Single-tenant in-memory Set yeterli (process
  //    restart olmadıkça).
  const evaluationCycleId = `eval-${now.getTime()}-${randomUUID().slice(0, 8)}`;
  const executedInThisCycle = new Set<string>();
  const dedupeKey = (stratId: string, action: 'BUY' | 'SELL') => `${stratId}::${action}::${evaluationCycleId}`;

  // 3. Process each symbol
  for (const [symbol, strats] of symbolMap.entries()) {
    try {
      // Fetch candles
      const candles = interval === '1d'
        ? await getDailyCandlesForAI(symbol, 365)
        : await get4HourCandles(symbol, 720);

      if (!candles.length) {
        console.warn(`[ForwardTest] No candles found for ${symbol} at ${interval}`);
        continue;
      }

      const currentCandle = candles[candles.length - 1];

      // Process each strategy for this symbol
      for (const strat of strats) {
        // Cooldown check
        if (strat.lastEvaluatedAt) {
          const hoursSinceLast = (now.getTime() - strat.lastEvaluatedAt.getTime()) / (1000 * 60 * 60);
          if (hoursSinceLast < (strat.cooldownHours || 0)) {
            continue; // Skip, cooldown active
          }
        }

        // Calculate indicators specifically requested by this strategy
        const activeInds = new Set((strat.indicatorConfig?.activeIndicators as string[]) || []);
        const computed = computeIndicators(candles, activeInds, strat.indicatorConfig?.params || {});

        // Check rules
        const entryTriggered = evaluateRule(strat.entryRule, computed, currentCandle.close, candles.length);
        const exitTriggered = evaluateRule(strat.exitRule, computed, currentCandle.close, candles.length);

        if (!entryTriggered && !exitTriggered) {
          // No action, just update evaluation timestamp
          await ForwardTestStrategy.updateOne(
            { _id: strat._id },
            { $set: { lastEvaluatedAt: now } }
          );
          continue;
        }

        const action = exitTriggered ? 'SELL' : 'BUY';

        // IDEMPOTENCY CHECK: Aynı cycle'da aynı strateji+action zaten
        // işlendiyse skip et (partial failure / re-entry guard).
        const key = dedupeKey(strat._id.toString(), action);
        if (executedInThisCycle.has(key)) {
          console.warn(`[ForwardTest] DEDUPE: ${action} for ${strat.name} already executed in cycle ${evaluationCycleId}`);
          continue;
        }
        executedInThisCycle.add(key);

        // Execution Logic based on mode
        if (strat.executionMode === 'shadow') {
          await processShadowTrade(strat, action, currentCandle.close, now, evaluationCycleId);
        } else if (strat.executionMode === 'auto') {
          await processAutoTrade(strat, action, currentCandle.close, now, evaluationCycleId);
        } else if (strat.executionMode === 'propose_only') {
          // In real app, we would push to a Notifications collection here
          console.log(`[ForwardTest] PROPOSE ${action} ${symbol} for Strategy ${strat.name}`);
        }

        // Update strategy stats
        await ForwardTestStrategy.updateOne(
          { _id: strat._id },
          {
            $set: { lastEvaluatedAt: now },
            $inc: { signalsLogged: 1 }
          }
        );

        executedCount++;
      }
    } catch (e) {
      console.error(`[ForwardTest] Error processing symbol ${symbol}:`, e);
    }
  }

  return { executed: executedCount };
}

// ------------------------------------------------------------------
// Sub-routines
// ------------------------------------------------------------------

async function processShadowTrade(strat: any, action: 'BUY' | 'SELL', price: number, now: Date, evaluationCycleId: string) {
  // Shadow trades maintain a hypothetical P&L.
  // Assuming 1 position at a time (buy then sell).
  // evaluationCycleId: log'larda izlenebilirlik için kullanılıyor (idempotency guard main loop'ta).
  void evaluationCycleId;

  if (action === 'BUY' && !strat.shadowCurrentPosition) {
    // Open shadow position
    await ForwardTestStrategy.updateOne(
      { _id: strat._id },
      {
        $set: { shadowCurrentPosition: true, shadowEntryPrice: toDecimal128(price) },
        $inc: { shadowTrades: 1 }
      }
    );
    console.log(`[ForwardTest] SHADOW BUY ${strat.symbol} at $${price}`);
  } else if (action === 'SELL' && strat.shadowCurrentPosition && strat.shadowEntryPrice) {
    // Close shadow position and calculate simple P&L
    const entryPrice = fromDecimal128(strat.shadowEntryPrice);
    const pnl = price - entryPrice; // Simplified PnL per share
    // Real implementation would multiply by a theoretical share size.
    // Let's assume a theoretical size based on capitalAllocated.
    const capital = fromDecimal128(strat.capitalAllocated);
    const shares = capital / entryPrice;
    const totalPnl = pnl * shares;

    // Add to existing shadow Pnl
    const existingPnl = fromDecimal128(strat.shadowPnl);
    const newPnl = existingPnl + totalPnl;

    await ForwardTestStrategy.updateOne(
      { _id: strat._id },
      {
        $set: {
          shadowCurrentPosition: false,
          shadowEntryPrice: null,
          shadowPnl: toDecimal128(newPnl)
        },
        $inc: { shadowTrades: 1 }
      }
    );
    console.log(`[ForwardTest] SHADOW SELL ${strat.symbol} at $${price} | PnL: $${totalPnl.toFixed(2)}`);
  }
}

async function processAutoTrade(strat: any, action: 'BUY' | 'SELL', price: number, now: Date, evaluationCycleId: string) {
  try {
    // evaluationCycleId: idempotency anahtarı olarak clientRequestId'ye gömülü.
    // Aynı cycle içinde iki kez execute edilse bile executeTrade'in kendi
    // duplicate-check mekanizması trade'i 2. kez insert etmez.
    const wallet = await Wallet.findOne({ userId: strat.userId }).lean();
    if (!wallet) return;

    let quantity = 0;

    if (action === 'BUY') {
      // Calculate quantity based on position sizing
      const buyingPower = fromDecimal128(wallet.cashBalance) - fromDecimal128(wallet.reservedBalance);
      if (buyingPower <= 0) return;

      if (strat.positionSizing.mode === 'fixed_cash') {
        const cashToUse = Math.min(strat.positionSizing.value, buyingPower);
        quantity = Math.floor(cashToUse / price);
      } else if (strat.positionSizing.mode === 'percent_portfolio') {
        const totalEquity = buyingPower; // simplified
        const cashToUse = (strat.positionSizing.value / 100) * totalEquity;
        quantity = Math.floor(cashToUse / price);
      } else if (strat.positionSizing.mode === 'fixed_shares') {
        quantity = strat.positionSizing.value;
      }
    } else {
      // SELL action - find existing position
      const pos = await Position.findOne({ userId: strat.userId, symbol: strat.symbol, status: 'open' }).lean();
      if (!pos || pos.quantity <= 0) return; // Nothing to sell
      quantity = pos.quantity; // sell all
    }

    if (quantity <= 0) return;

    const res = await executeTrade({
      userId: strat.userId,
      symbol: strat.symbol,
      side: action,
      quantity,
      clientRequestId: `auto-${strat._id}-${evaluationCycleId}-${action}`,
      triggerSource: 'strategy',
      triggerContext: { strategyId: strat._id.toString() },
    });

    if (!res.success) {
      if (res.errorCode === 'MARKET_CLOSED') {
        console.log(`[ForwardTest] MARKET_CLOSED. Creating market_on_open order for ${strat.symbol}`);
        await createPendingOrder({
          userId: strat.userId,
          symbol: strat.symbol,
          side: action,
          orderType: 'market_on_open',
          quantity,
          triggerPrice: price, // Current close as reference, though market_on_open triggers at market price usually, but simulator uses triggerPrice + slippage
          parentStrategyId: strat._id.toString(),
        });
      } else {
        console.warn(`[ForwardTest] Auto trade failed for ${strat.symbol}:`, res.error);
      }
      return;
    }

    await ForwardTestStrategy.updateOne(
      { _id: strat._id },
      { $inc: { tradesExecuted: 1 } }
    );

    console.log(`[ForwardTest] AUTO ${action} ${strat.symbol} x${quantity} for Strategy ${strat.name}`);
  } catch (e) {
    console.error(`[ForwardTest] Auto trade failed for strategy ${strat._id}:`, e);
  }
}
