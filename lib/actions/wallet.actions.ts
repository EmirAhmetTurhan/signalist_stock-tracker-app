'use server';

// lib/actions/wallet.actions.ts — Wallet CRUD server actions
// All wallet mutations go through here. Never call MongoDB directly from client components.
//
// SECURITY: userId is ALWAYS derived from the authenticated session (better-auth).
// We deliberately ignore any userId sent by the client to prevent IDOR.

import { connectToDatabase } from '@/database/mongoose';
import Wallet from '@/database/models/wallet.model';
import Position from '@/database/models/position.model';
import Trade from '@/database/models/trade.model';
import { toDecimal128, fromDecimal128, decimalMul, decimalSub, DEFAULT_INITIAL_BALANCE } from '@/lib/paper-trading/decimal-utils';
import { executeTrade } from '@/lib/paper-trading/execution-engine';
import { fetchPriceMap } from '@/lib/paper-trading/portfolio-metrics';
import { randomUUID } from 'crypto';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';

async function requireUserId(): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

// ============================================================
// Get or Create Wallet (lazy initialization)
// ============================================================

export async function getOrCreateWallet() {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: 'Oturum bulunamadı.' };

  try {
    await connectToDatabase();

    // Upsert to prevent race condition: two concurrent requests both trying to create
    const wallet = await Wallet.findOneAndUpdate(
      { userId },
      {
        $setOnInsert: {
          userId,
          currency: 'USD',
          cashBalance: toDecimal128(DEFAULT_INITIAL_BALANCE),
          reservedBalance: toDecimal128(0),
          initialBalance: toDecimal128(DEFAULT_INITIAL_BALANCE),
          resetCount: 0,
          lastResetAt: null,
        },
      },
      { upsert: true, returnDocument: 'after', new: true }
    ).lean();

    if (!wallet) {
      return { success: false, error: 'Cüzdan oluşturulamadı.' };
    }

    return {
      success: true,
      wallet: {
        id: String(wallet._id),
        userId: wallet.userId,
        currency: wallet.currency,
        cashBalance: fromDecimal128(wallet.cashBalance),
        reservedBalance: fromDecimal128(wallet.reservedBalance),
        initialBalance: fromDecimal128(wallet.initialBalance),
        resetCount: wallet.resetCount || 0,
        lastResetAt: wallet.lastResetAt?.toISOString() || null,
        buyingPower: fromDecimal128(wallet.cashBalance) - fromDecimal128(wallet.reservedBalance),
      },
    };
  } catch (e) {
    console.error('[WalletActions] getOrCreateWallet error:', e);
    return { success: false, error: 'Cüzdan yüklenirken bir hata oluştu.' };
  }
}

// ============================================================
// Get Wallet Balance (read-only)
// ============================================================

export async function getWalletBalance() {
  const userId = await requireUserId();
  if (!userId) return null;

  try {
    await connectToDatabase();
    const wallet = await Wallet.findOne({ userId }).lean();
    if (!wallet) return null;

    return {
      cashBalance: fromDecimal128(wallet.cashBalance),
      reservedBalance: fromDecimal128(wallet.reservedBalance),
      initialBalance: fromDecimal128(wallet.initialBalance),
      buyingPower: fromDecimal128(wallet.cashBalance) - fromDecimal128(wallet.reservedBalance),
      resetCount: wallet.resetCount || 0,
    };
  } catch (e) {
    console.error('[WalletActions] getWalletBalance error:', e);
    return null;
  }
}

// ============================================================
// Reset Wallet
// ============================================================

export async function resetWallet() {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: 'Oturum bulunamadı.' };

  try {
    await connectToDatabase();

    // Step 1: Close all open positions at current prices
    const openPositions = await Position.find({ userId, status: 'open' }).lean();

    for (const position of openPositions) {
      // Force-close each position
      try {
        await executeTrade({
          userId,
          symbol: position.symbol,
          side: 'SELL',
          quantity: position.quantity,
          clientRequestId: `reset-${randomUUID()}`,
          triggerSource: 'manual',
          triggerContext: { signalSnapshot: { reason: 'wallet_reset' } },
          skipMarketHoursCheck: true,
        });
      } catch (e) {
        console.warn(`[WalletReset] Could not sell ${position.symbol} via engine, force-closing using cached price`);
        try {
          const now = new Date();

          // Fetch last known price or fallback to entry price
          const priceMap = await fetchPriceMap([position.symbol]);
          const lastPrice = priceMap[position.symbol] || fromDecimal128(position.avgEntryPrice);
          const proceeds = decimalMul(lastPrice, position.quantity);
          const realizedPnl = decimalMul(decimalSub(lastPrice, fromDecimal128(position.avgEntryPrice)), position.quantity);

          // Credit wallet temporarily before the big reset, so intermediate equity is mathematically sound
          await Wallet.findOneAndUpdate(
            { userId },
            { $inc: { cashBalance: toDecimal128(proceeds) } }
          );

          // Close position
          await Position.updateOne(
            { _id: position._id },
            { $set: { status: 'closed', closedAt: now, closeReason: 'corporate_action', quantity: 0, lastTradeAt: now } }
          );

          // Insert audit log trade
          await Trade.create({
            userId,
            positionId: position._id,
            clientRequestId: `reset-force-${randomUUID()}`,
            symbol: position.symbol,
            side: 'SELL',
            quantity: position.quantity,
            fillPrice: toDecimal128(lastPrice),
            notional: toDecimal128(proceeds),
            fees: toDecimal128(0),
            realizedPnl: toDecimal128(realizedPnl),
            triggerSource: 'corporate_action',
            triggerContext: { reason: 'wallet_reset_fallback' },
            status: 'executed',
            executedAt: now,
          });
        } catch (fallbackError) {
          console.error(`[WalletReset] Critical fallback closure failed for ${position.symbol}:`, fallbackError);
          throw new Error(`Failed to close position for ${position.symbol} during wallet reset.`);
        }
      }
    }

    // Step 2: Reset wallet balance
    const wallet = await Wallet.findOneAndUpdate(
      { userId },
      {
        $set: {
          cashBalance: toDecimal128(DEFAULT_INITIAL_BALANCE),
          reservedBalance: toDecimal128(0),
          initialBalance: toDecimal128(DEFAULT_INITIAL_BALANCE),
          lastResetAt: new Date(),
        },
        $inc: { resetCount: 1 },
      },
      { returnDocument: 'after' }
    ).lean();

    if (!wallet) {
      return { success: false, error: 'Cüzdan bulunamadı.' };
    }

    return {
      success: true,
      message: 'Portföy başarıyla sıfırlandı.',
      newBalance: fromDecimal128(wallet.cashBalance),
      resetCount: wallet.resetCount,
    };
  } catch (e) {
    console.error('[WalletActions] resetWallet error:', e);
    return { success: false, error: 'Cüzdan sıfırlanırken bir hata oluştu.' };
  }
}
