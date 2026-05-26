'use server';

import { connectToDatabase } from '@/database/mongoose';
import Position from '@/database/models/position.model';
import Wallet from '@/database/models/wallet.model';
import Trade from '@/database/models/trade.model';
import PendingOrder from '@/database/models/pending-order.model';
import ForwardTestStrategy from '@/database/models/forward-test-strategy.model';
import Notification from '@/database/models/notification.model';
import { fromDecimal128, toDecimal128, decimalMul, decimalAdd } from '@/lib/paper-trading/decimal-utils';
import { fetchJSON } from '@/lib/actions/finnhub.actions';
import { revalidatePath } from 'next/cache';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

/**
 * 7-Step Lifecycle for Delisting a Stock
 * 1. Force-close at last known price.
 * 2. Set status to delisted (or remove from active positions).
 * 3. Credit cashBalance.
 * 4. Insert Trade with triggerSource: 'corporate_action'.
 * 5. Pause forward-tests on the symbol.
 * 6. Cancel pending orders on the symbol & release reservedBalance.
 * 7. Notify user.
 */
export async function processDelisting(symbol: string) {
  try {
    await connectToDatabase();
    const upperSymbol = symbol.toUpperCase();

    // Find all active positions for this symbol
    const activePositions = await Position.find({ symbol: upperSymbol, status: 'open' });
    
    if (activePositions.length === 0) {
      return { success: true, message: `No active positions found for ${upperSymbol}.` };
    }

    // Try to get the last known price. If Finnhub returns 0 or error, fallback to avgEntryPrice.
    let lastKnownPrice = 0;
    try {
      const token = process.env.FINNHUB_API_KEY;
      if (token) {
        const quote = await fetchJSON<{ c?: number }>(`${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(upperSymbol)}&token=${token}`);
        if (quote && quote.c && quote.c > 0) {
          lastKnownPrice = quote.c;
        }
      }
    } catch (e) {
      console.warn(`Could not fetch quote for delisted symbol ${upperSymbol}. Using avgEntryPrice.`);
    }

    let processedCount = 0;

    for (const pos of activePositions) {
      const qty = pos.quantity;
      const priceToUse = lastKnownPrice > 0 ? lastKnownPrice : fromDecimal128(pos.avgEntryPrice);
      const totalValue = decimalMul(qty, priceToUse);
      
      const realizedPnl = decimalMul(qty, priceToUse - fromDecimal128(pos.avgEntryPrice));
      const cumulativePnl = decimalAdd(fromDecimal128(pos.realizedPnlToDate), realizedPnl);

      const session = await Position.startSession();
      try {
        await session.withTransaction(async () => {
          // 1 & 2. Close position
          await Position.updateOne(
            { _id: pos._id },
            { 
              $set: { 
                quantity: 0, 
                status: 'closed', 
                closeReason: 'delisted',
                closedAt: new Date(),
                realizedPnlToDate: toDecimal128(cumulativePnl)
              } 
            },
            { session }
          );

          // 3. Credit cashBalance
          await Wallet.updateOne(
            { userId: pos.userId },
            { $inc: { cashBalance: toDecimal128(totalValue) } },
            { session }
          );

          // 4. Insert Trade
          await Trade.create([{
            userId: pos.userId,
            symbol: upperSymbol,
            side: 'SELL',
            quantity: qty,
            price: toDecimal128(priceToUse),
            notionalValue: toDecimal128(totalValue),
            realizedPnl: toDecimal128(realizedPnl),
            triggerSource: 'corporate_action',
            clientRequestId: `delist-${upperSymbol}-${pos._id}`,
            executedAt: new Date()
          }], { session });

          // 6. Cancel pending orders & release reserves
          const pendingOrders = await PendingOrder.find({ userId: pos.userId, symbol: upperSymbol, status: 'active' }).session(session);
          for (const order of pendingOrders) {
            await PendingOrder.updateOne({ _id: order._id }, { $set: { status: 'cancelled' } }, { session });
            if (order.side === 'BUY') {
              await Wallet.updateOne(
                { userId: pos.userId },
                { 
                  $inc: { 
                    cashBalance: order.reservedFunds,
                    reservedBalance: toDecimal128(-fromDecimal128(order.reservedFunds))
                  } 
                },
                { session }
              );
            }
          }

          // 7. Notify User
          await Notification.create([{
            userId: pos.userId,
            type: 'system_alert',
            title: `Hisse Delist Edildi: ${upperSymbol}`,
            message: `${upperSymbol} piyasadan kaldırıldığı için pozisyonunuz ${priceToUse} fiyatından otomatik kapatıldı.`
          }], { session });

          processedCount++;
        });
      } finally {
        await session.endSession();
      }
    }

    // 5. Pause Forward Tests
    await ForwardTestStrategy.updateMany(
      { symbol: upperSymbol, status: 'running' },
      { $set: { status: 'paused' } }
    );

    revalidatePath('/portfolio');
    revalidatePath('/ta');

    return { success: true, message: `Processed delisting for ${upperSymbol} across ${processedCount} users.` };
  } catch (error) {
    console.error('Error processing delisting:', error);
    return { success: false, error: 'Failed to process delisting' };
  }
}
