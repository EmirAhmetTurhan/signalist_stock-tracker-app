import { inngest } from './client';
import { connectToDatabase } from '@/database/mongoose';
import Position from '@/database/models/position.model';
import Wallet from '@/database/models/wallet.model';
import PendingOrder from '@/database/models/pending-order.model';
import Notification from '@/database/models/notification.model';
import { fromDecimal128, toDecimal128, decimalMul } from '@/lib/paper-trading/decimal-utils';
import { fetchJSON } from '@/lib/actions/finnhub.actions';
import CorporateActionLog from '@/database/models/corporate-action-log.model';
import { getCurrentPrice } from '@/lib/actions/finnhub/quote';
import { Types } from 'mongoose';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

export const processCorporateActionsJob = inngest.createFunction(
  { id: 'process-corporate-actions', name: 'Process Corporate Actions (Daily)', triggers: [{ cron: '0 0 * * *' }] }, // Runs at midnight UTC
  async ({ step }) => {
    await connectToDatabase();

    const token = process.env.FINNHUB_API_KEY;
    if (!token) {
      console.error('FINNHUB_API_KEY is not set for corporate actions job.');
      return { success: false, reason: 'No API Key' };
    }

    // 1. Get unique symbols across all open positions
    const activePositions = await step.run('fetch-active-positions', async () => {
      return Position.find({ status: 'open' }).lean();
    });

    if (activePositions.length === 0) return { processed: 0 };

    const symbols = [...new Set(activePositions.map(p => p.symbol))];

    // Determine the date range (e.g. yesterday)
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const fromStr = yesterday.toISOString().split('T')[0];
    const toStr = today.toISOString().split('T')[0];

    // 2. Process Dividends
    await step.run('process-dividends', async () => {
      for (const symbol of symbols) {
        try {
          // Note: Finnhub /stock/dividend might require Basic/Premium tier.
          // Using a try-catch to swallow errors gracefully if on free tier.
          const dividends = await fetchJSON<any[]>(`${FINNHUB_BASE_URL}/stock/dividend?symbol=${encodeURIComponent(symbol)}&from=${fromStr}&to=${toStr}&token=${token}`);
          
          if (!dividends || !Array.isArray(dividends) || dividends.length === 0) continue;

          for (const div of dividends) {
            if (div.exDate === fromStr || div.exDate === toStr) {
              // Idempotency Guard
              const alreadyProcessed = await CorporateActionLog.findOne({
                symbol: symbol.toUpperCase(),
                exDate: div.exDate,
                type: 'dividend'
              });
              if (alreadyProcessed) {
                console.log(`[CorporateActions] Dividend for ${symbol} on ${div.exDate} already processed. Skipping.`);
                continue;
              }

              // Find all users holding this symbol
              const holders = activePositions.filter(p => p.symbol === symbol);
              let processedAny = false;
              for (const pos of holders) {
                // If position opened before exDate
                const openedAt = new Date(pos.openedAt);
                const exDateObj = new Date(div.exDate);
                if (openedAt < exDateObj) {
                  const qtyVal = parseFloat(pos.quantity.toString());
                  const dividendAmount = qtyVal * div.amount;
                  
                  await Wallet.updateOne(
                    { _id: pos.walletId },
                    { 
                      $inc: { 
                        cashBalance: toDecimal128(dividendAmount),
                        totalEquity: toDecimal128(dividendAmount)
                      } 
                    }
                  );

                  await Notification.create({
                    userId: pos.userId,
                    type: 'system_alert',
                    title: `Temettü Ödemesi: ${symbol}`,
                    message: `${symbol} hisseden hisse başı $${div.amount} üzerinden toplam $${dividendAmount.toFixed(2)} temettü kazandınız.`
                  });
                  processedAny = true;
                }
              }

              if (processedAny || holders.length === 0) {
                await CorporateActionLog.create({
                  symbol: symbol.toUpperCase(),
                  exDate: div.exDate,
                  type: 'dividend'
                });
              }
            }
          }
        } catch (e) {
          console.warn(`[CorporateActions] Dividend fetch failed for ${symbol}. (Requires Premium tier?)`, e);
        }
      }
    });

    // 3. Process Stock Splits
    await step.run('process-splits', async () => {
      for (const symbol of symbols) {
        try {
          // Finnhub /stock/split
          const splits = await fetchJSON<any[]>(`${FINNHUB_BASE_URL}/stock/split?symbol=${encodeURIComponent(symbol)}&from=${fromStr}&to=${toStr}&token=${token}`);
          
          if (!splits || !Array.isArray(splits) || splits.length === 0) continue;

          for (const split of splits) {
            if (split.date === fromStr || split.date === toStr) {
              // Idempotency Guard
              const alreadyProcessed = await CorporateActionLog.findOne({
                symbol: symbol.toUpperCase(),
                exDate: split.date,
                type: 'split'
              });
              if (alreadyProcessed) {
                console.log(`[CorporateActions] Split for ${symbol} on ${split.date} already processed. Skipping.`);
                continue;
              }

              const fromFactor = split.fromFactor || 1;
              const toFactor = split.toFactor || 1;
              const ratio = toFactor / fromFactor; // e.g. 2 for a 2-for-1 split

              if (ratio === 1) continue;

              const holders = activePositions.filter(p => p.symbol === symbol);
              let processedAny = false;
              
              for (const pos of holders) {
                // Adjust position
                const qtyVal = parseFloat(pos.quantity.toString());
                const newQty = qtyVal * ratio;
                const newAvgEntry = fromDecimal128(pos.avgEntryPrice) / ratio;

                await Position.updateOne(
                  { _id: pos._id },
                  { 
                    $set: { 
                      quantity: Types.Decimal128.fromString(newQty.toFixed(4)),
                      avgEntryPrice: toDecimal128(newAvgEntry)
                    } 
                  }
                );

                // Adjust pending orders
                const pending = await PendingOrder.find({ userId: pos.userId, symbol: symbol, status: 'active' });
                for (const order of pending) {
                  const oQtyVal = parseFloat(order.quantity.toString());
                  const newOrderQty = oQtyVal * ratio;
                  const newTrigger = fromDecimal128(order.triggerPrice) / ratio;
                  await PendingOrder.updateOne(
                    { _id: order._id },
                    {
                      $set: {
                        quantity: Types.Decimal128.fromString(newOrderQty.toFixed(4)),
                        triggerPrice: toDecimal128(newTrigger)
                      }
                    }
                  );
                }

                // Recalculate totalEquity for the wallet
                const wallet = await Wallet.findById(pos.walletId);
                if (wallet) {
                  const walletPositions = await Position.find({ walletId: wallet._id, status: 'open' });
                  let positionsMV = 0;
                  for (const p of walletPositions) {
                    const pQty = parseFloat(p.quantity.toString());
                    const currentPrice = await getCurrentPrice(p.symbol) || fromDecimal128(p.currentPrice);
                    positionsMV += pQty * currentPrice;
                  }
                  const cashVal = parseFloat(wallet.cashBalance.toString());
                  wallet.totalEquity = toDecimal128(cashVal + positionsMV);
                  await wallet.save();
                }

                await Notification.create({
                  userId: pos.userId,
                  type: 'system_alert',
                  title: `Hisse Bölünmesi: ${symbol}`,
                  message: `${symbol} hissesinde ${toFactor}:${fromFactor} bölünme gerçekleşti. Pozisyonunuz ve açık emirleriniz güncellendi.`
                });
                processedAny = true;
              }

              if (processedAny || holders.length === 0) {
                await CorporateActionLog.create({
                  symbol: symbol.toUpperCase(),
                  exDate: split.date,
                  type: 'split'
                });
              }
            }
          }
        } catch (e) {
          console.warn(`[CorporateActions] Split fetch failed for ${symbol}. (Requires Premium tier?)`, e);
        }
      }
    });

    return { success: true, processedSymbols: symbols.length };
  }
);
