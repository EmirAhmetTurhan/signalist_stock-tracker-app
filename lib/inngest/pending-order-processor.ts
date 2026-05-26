import { inngest } from './client';
import { connectToDatabase } from '@/database/mongoose';
import PendingOrder from '@/database/models/pending-order.model';
import Notification from '@/database/models/notification.model';
import Wallet from '@/database/models/wallet.model';
import Position from '@/database/models/position.model';
import { executeTrade } from '@/lib/paper-trading/execution-engine';
import { fromDecimal128, toDecimal128 } from '@/lib/paper-trading/decimal-utils';
import { getYahooIntradayCandles } from '@/lib/actions/finnhub.actions';

export const evaluatePendingOrdersJob = inngest.createFunction(
  { id: 'evaluate-pending-orders', name: 'Evaluate Pending Orders (15m)', triggers: [{ cron: '*/15 13-21 * * 1-5' }] }, // Every 15 min during US market hours (13:00 - 21:00 UTC)
  async ({ step }: { step: any }) => {
    await connectToDatabase();

    const now = new Date();

    // 1. Find active orders
    const activeOrders = await step.run('fetch-active-orders', async () => {
      return PendingOrder.find({ status: 'active' }).sort({ createdAt: 1 }).lean();
    });

    if (activeOrders.length === 0) return { processed: 0 };

    // 2. Handle Expirations
    const expiredOrders = activeOrders.filter((o: any) => o.timeInForce === 'day' && o.expiresAt && new Date(o.expiresAt) < now);
    const validOrders = activeOrders.filter((o: any) => !expiredOrders.includes(o));

    if (expiredOrders.length > 0) {
      await step.run('process-expirations', async () => {
        for (const order of expiredOrders) {
          const updated = await PendingOrder.findOneAndUpdate(
            { _id: order._id, status: 'active' },
            { status: 'expired' }
          );

          if (updated) {
            // Release reserves
            if (order.side === 'BUY') {
              await Wallet.updateOne(
                { userId: order.userId },
                { 
                  $inc: { 
                    cashBalance: order.reservedFunds,
                    reservedBalance: toDecimal128(-fromDecimal128(order.reservedFunds))
                  } 
                }
              );
            } else if (order.parentPositionId) {
              await Position.updateOne(
                { _id: order.parentPositionId },
                { $inc: { reservedQuantity: -order.quantity } }
              );
            }

            await Notification.create({
              userId: order.userId,
              type: 'ai_job_completed',
              title: 'Emir Süresi Doldu',
              message: `${order.symbol} için ${order.quantity} adetlik ${order.side} emrinizin süresi doldu ve iptal edildi.`
            });
          }
        }
      });
    }

    if (validOrders.length === 0) return { processed: 0, expired: expiredOrders.length };

    // 3. Group by symbol
    const symbols = [...new Set(validOrders.map((o: any) => o.symbol))];
    
    // 4. Fetch Intraday Candles
    const candlesData = await step.run('fetch-intraday-candles', async () => {
      const data: Record<string, any[]> = {};
      for (const symbol of symbols as string[]) {
        data[symbol] = await getYahooIntradayCandles(symbol, 2);
      }
      return data;
    });

    // 5. Evaluate Triggers
    let triggeredCount = 0;

    await step.run('evaluate-and-execute', async () => {
      for (const order of validOrders) {
        const candles = candlesData[order.symbol] || [];
        if (candles.length === 0) continue;

        // Use the most recent candle
        const currentBar = candles[candles.length - 1];
        const low = currentBar.low;
        const high = currentBar.high;
        const triggerPrice = fromDecimal128(order.triggerPrice);

        let triggered = false;

        if (order.orderType === 'limit') {
          if (order.side === 'BUY' && low <= triggerPrice) triggered = true;
          if (order.side === 'SELL' && high >= triggerPrice) triggered = true;
        } else if (order.orderType === 'stop_loss') {
          if (order.side === 'BUY' && high >= triggerPrice) triggered = true;
          if (order.side === 'SELL' && low <= triggerPrice) triggered = true;
        } else if (order.orderType === 'take_profit') {
          if (order.side === 'BUY' && low <= triggerPrice) triggered = true;
          if (order.side === 'SELL' && high >= triggerPrice) triggered = true;
        } else if (order.orderType === 'market_on_open') {
          triggered = true; // market is open since cron is running
        }

        if (triggered) {
          // Atomic status transition
          const updated = await PendingOrder.findOneAndUpdate(
            { _id: order._id, status: 'active' },
            { status: 'triggered', triggeredAt: now }
          );

          if (updated) {
            triggeredCount++;
            
            // Call execution engine using reserved funds
            const res = await executeTrade({
              userId: order.userId,
              symbol: order.symbol,
              side: order.side as 'BUY' | 'SELL',
              quantity: order.quantity,
              clientRequestId: `pending-${order._id}-${now.getTime()}`,
              triggerSource: order.orderType as any,
              useReservedFunds: true, // Use the reserved cash/quantity
            });

            if (!res.success) {
              console.error(`Pending order ${order._id} execution failed:`, res.error);
              // Notification for failure
              await Notification.create({
                userId: order.userId,
                type: 'ai_job_failed',
                title: 'Emir Gerçekleştirilemedi',
                message: `${order.symbol} emriniz tetiklendi ancak reddedildi: ${res.userMessage}`
              });
              // Note: If execution fails (e.g. circuit breaker), the order is still marked triggered. 
              // We could refund reserves here, but since it's an edge case, we'll keep it simple for now and release reserves.
              if (order.side === 'BUY') {
                  await Wallet.updateOne(
                    { userId: order.userId },
                    { 
                      $inc: { 
                        cashBalance: order.reservedFunds,
                        reservedBalance: toDecimal128(-fromDecimal128(order.reservedFunds))
                      } 
                    }
                  );
                } else if (order.parentPositionId) {
                  await Position.updateOne(
                    { _id: order.parentPositionId },
                    { $inc: { reservedQuantity: -order.quantity } }
                  );
                }
            } else {
               await Notification.create({
                userId: order.userId,
                type: 'ai_job_completed',
                title: 'Emir Tetiklendi',
                message: `${order.symbol} emriniz tetiklendi ve gerçekleşti.`
              });
            }
          }
        }
      }
    });

    return { processed: validOrders.length, expired: expiredOrders.length, triggered: triggeredCount };
  }
);
