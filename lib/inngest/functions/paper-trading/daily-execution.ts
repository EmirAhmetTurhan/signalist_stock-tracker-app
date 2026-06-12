import { inngest } from '@/lib/inngest/client';
import { connectToDatabase } from '@/database/mongoose';
import Wallet from '@/database/models/wallet.model';
import Position from '@/database/models/position.model';
import Transaction from '@/database/models/transaction.model';
import { Types } from 'mongoose';
import { getCandlesForInterval } from '@/lib/actions/finnhub/candles';
import { computeIndicators, normalizeParams } from '@/lib/ta/compute';
import { extractTradeMarkers, generateAllSignals } from '@/lib/ta/signals';
import { simulateTrade, DEFAULT_RISK_CONFIG } from '@/lib/ta/simulation/trade-simulator';
import { computeATR } from '@/lib/ta/strategy-optimizer/run-backtest';
import { getCurrentPrice } from '@/lib/actions/finnhub/quote';

function calculatePositionSize(equity: number, price: number, config: any, atr: number) {
  if (!config) return 1;
  if (config.type === 'fixed_fractional') return (equity * config.value) / price;
  if (config.type === 'all_in') return equity / price;
  if (config.type === 'risk_based') return atr > 0 ? (equity * config.value) / atr : 1;
  if (config.type === 'half_kelly') return (equity * 0.5) / price; 
  return 1;
}

export const dailyExecution = inngest.createFunction(
  { 
    id: 'daily-paper-trading-execution',
    triggers: [{ cron: '0 20 * * 1-5' }, { event: 'paper-trading/daily-execution' }]
  },
  async ({ step }) => {
    await connectToDatabase();

    const wallets = await step.run('fetch-live-wallets', async () => {
      const liveWallets = await Wallet.find({ type: 'live' }).lean();
      return liveWallets;
    });

    for (const walletObj of wallets) {
      await step.run(`process-wallet-${walletObj._id}`, async () => {
        let wallet: any;
        try {
          await connectToDatabase();
          wallet = await Wallet.findById(walletObj._id);
          if (!wallet) return;

          const strategyPortfolio = wallet.strategyPortfolio || [];
          const activeSymbols = wallet.activeSymbols && wallet.activeSymbols.length > 0 
                                  ? wallet.activeSymbols 
                                  : ['AAPL', 'MSFT', 'SPY']; // Fallback
          
          let walletTotalEquity = parseFloat(wallet.totalEquity.toString());
          const newTransactions: any[] = [];
          
          for (const symbol of activeSymbols) {
            // Get 100 days of history for indicator calculation
            const candles = await getCandlesForInterval(symbol, '1d', 100);
            if (candles.length < 50) continue; // Not enough data
            
            const lastBarIndex = candles.length - 1;
            const lastBar = candles[lastBarIndex];
            
            // 1. Compute Indicators
            const activeIndicators = new Set<string>();
            let mergedParams = { ...DEFAULT_RISK_CONFIG };
            for (const s of strategyPortfolio) {
              if (s.indicators) {
                for (const ind of s.indicators) {
                  if (ind.name) activeIndicators.add(ind.name);
                }
              }
              if (s.bestParams) {
                mergedParams = { ...mergedParams, ...s.bestParams };
              }
            }
            
            const computed = computeIndicators(candles, activeIndicators, normalizeParams(mergedParams));
            
            // 2. Generate Signals
            let netSignal = 0;
            
            for (const s of strategyPortfolio) {
              const stratIndicators = new Set<string>();
              if (s.indicators) s.indicators.forEach((i: any) => { if(i.name) stratIndicators.add(i.name); });
              const stratComputed = computeIndicators(candles, stratIndicators, normalizeParams(s.bestParams || {}));
              
              const fusion = generateAllSignals(stratComputed, candles);
              const label = fusion.overall.label;
              
              if (label === 'STRONG BUY' || label === 'WEAK BUY') {
                netSignal += s.weight;
              } else if (label === 'STRONG SELL' || label === 'WEAK SELL') {
                netSignal -= s.weight;
              }
            }
            
            let action: 'BUY' | 'SELL' | 'FLAT' = 'FLAT';
            if (netSignal >= 0.4) action = 'BUY';
            else if (netSignal <= -0.4) action = 'SELL';
            
            // 3. Find open position
            let activePosition = await Position.findOne({ walletId: wallet._id, symbol, status: 'open' });
            
            // Always update unrealizedPnl and currentPrice for active positions, even if FLAT
            const currentPrice = await getCurrentPrice(symbol) || lastBar.close;
            if (activePosition) {
              activePosition.currentPrice = Types.Decimal128.fromString(currentPrice.toFixed(2));
              const entryPrice = parseFloat(activePosition.avgEntryPrice.toString());
              const qty = parseFloat(activePosition.quantity.toString());
              const unrealized = activePosition.side === 'LONG' 
                ? (currentPrice - entryPrice) * qty 
                : (entryPrice - currentPrice) * qty;
              activePosition.unrealizedPnl = Types.Decimal128.fromString(unrealized.toFixed(2));
              await activePosition.save();
            }

            // 4. Simulate Trade (applies Faz 4 rules: pyramiding prevention, time_stop tracking)
            const atrValues = computeATR(candles, 14);

            // We only simulate if there is an action or if we need to check trailing stops / time stops
            if (action !== 'FLAT' || activePosition) {
              const tradeAction = action === 'FLAT' ? null : action;
              
              // We simulate just the current bar against the current position
              // simulateTrade expects a signal to either open or close.
              
              let simulateResult = null;
              try {
                  if (activePosition) {
                      const entryPrice = parseFloat(activePosition.avgEntryPrice.toString());
                      const unrealizedPct = activePosition.side === 'LONG' 
                        ? ((currentPrice - entryPrice) / entryPrice) * 100 
                        : ((entryPrice - currentPrice) / entryPrice) * 100;
                      
                      const currentMfe = parseFloat(activePosition.mfe.toString());
                      const currentMae = parseFloat(activePosition.mae.toString());
                      
                      activePosition.mfe = Types.Decimal128.fromString(Math.max(currentMfe, unrealizedPct).toFixed(2));
                      activePosition.mae = Types.Decimal128.fromString(Math.min(currentMae, unrealizedPct).toFixed(2));
                      await activePosition.save();

                      const entryIndex = activePosition.entryBarTime != null 
                        ? candles.findIndex(c => c.time === activePosition.entryBarTime) 
                        : candles.findIndex(c => Math.abs((c.time as number) - activePosition.openedAt.getTime() / 1000) < 86400);
                      const validEntryIndex = entryIndex !== -1 ? entryIndex : lastBarIndex;

                      const mfeVal = parseFloat(activePosition.mfe.toString());
                      const maeVal = parseFloat(activePosition.mae.toString());
                      const highestPrice = activePosition.side === 'LONG' 
                        ? entryPrice * (1 + mfeVal / 100) 
                        : entryPrice * (1 - maeVal / 100);
                      const lowestPrice = activePosition.side === 'LONG' 
                        ? entryPrice * (1 + maeVal / 100) 
                        : entryPrice * (1 - mfeVal / 100);

                      simulateResult = simulateTrade(candles, validEntryIndex, tradeAction || 'BUY', atrValues, {
                         ...DEFAULT_RISK_CONFIG
                      }, undefined, highestPrice, lowestPrice);
                  } else {
                      simulateResult = simulateTrade(candles, lastBarIndex, tradeAction || 'BUY', atrValues, {
                         ...DEFAULT_RISK_CONFIG
                      });
                  }
              } catch (e) {
                  // Strategy didn't trigger an exit, and didn't open a new one.
                  continue;
              }

              // Process trade result if a new trade was opened or closed TODAY
              if (simulateResult && typeof simulateResult.exitIndex === 'number' && simulateResult.exitIndex === lastBarIndex) {
                 // A trade was closed today!
                 if (activePosition) {
                    const costBasis = parseFloat(activePosition.costBasis.toString());
                    const pnl = costBasis * (simulateResult.realizedReturnPct / 100);
                    const fee = costBasis * 0.001;
                    
                    activePosition.status = 'closed';
                    activePosition.closedAt = new Date();
                    activePosition.realizedPnl = Types.Decimal128.fromString(pnl.toFixed(2));
                    activePosition.exitReason = simulateResult.exitReason as any;
                    activePosition.mfe = Types.Decimal128.fromString(simulateResult.mfe.toFixed(2));
                    activePosition.mae = Types.Decimal128.fromString(simulateResult.mae.toFixed(2));
                    await activePosition.save();

                    walletTotalEquity += (pnl - fee);
                    wallet.totalEquity = Types.Decimal128.fromString(walletTotalEquity.toFixed(2));
                    wallet.cashBalance = wallet.totalEquity;

                    newTransactions.push({
                       walletId: wallet._id,
                       userId: wallet.userId,
                       positionId: activePosition._id,
                       type: activePosition.side === 'LONG' ? 'SELL' : 'BUY',
                       subType: 'FULL_CLOSE',
                       symbol,
                       quantity: Types.Decimal128.fromString(parseFloat(activePosition.quantity.toString()).toFixed(4)),
                       price: Types.Decimal128.fromString(currentPrice.toFixed(2)),
                       amount: Types.Decimal128.fromString(((currentPrice * parseFloat(activePosition.quantity.toString())) - fee).toFixed(2)),
                       fees: Types.Decimal128.fromString(fee.toFixed(2)),
                       feeType: 'COMMISSION',
                       realizedPnl: Types.Decimal128.fromString(pnl.toFixed(2)),
                       metadata: { exitReason: simulateResult.exitReason },
                       executedAt: new Date(),
                    });
                 }
              } else if (simulateResult && simulateResult.entryIndex === lastBarIndex && !activePosition) {
                 // A new trade was opened today!
                 const positionSize = calculatePositionSize(walletTotalEquity, currentPrice, wallet.positionSizingConfig, atrValues[lastBarIndex]);
                 const qtyToBuy = parseFloat(positionSize.toFixed(4));
                 const costBasis = currentPrice * qtyToBuy; 
                 const fee = costBasis * 0.001;

                 const newPos = new Position({
                    walletId: wallet._id,
                    userId: wallet.userId,
                    symbol,
                    side: action,
                    status: 'open',
                    quantity: Types.Decimal128.fromString(qtyToBuy.toString()),
                    avgEntryPrice: Types.Decimal128.fromString(currentPrice.toFixed(2)),
                    currentPrice: Types.Decimal128.fromString(currentPrice.toFixed(2)),
                    unrealizedPnl: Types.Decimal128.fromString('0'),
                    costBasis: Types.Decimal128.fromString(costBasis.toFixed(2)),
                    entryBarTime: candles[lastBarIndex].time,
                    openedAt: new Date(),
                    lastTradeAt: new Date(),
                 });
                 await newPos.save();

                 walletTotalEquity -= fee;
                 wallet.totalEquity = Types.Decimal128.fromString(walletTotalEquity.toFixed(2));
                 wallet.cashBalance = wallet.totalEquity;

                 newTransactions.push({
                    walletId: wallet._id,
                    userId: wallet.userId,
                    positionId: newPos._id,
                    type: action,
                    subType: 'OPEN',
                    symbol,
                    quantity: Types.Decimal128.fromString(qtyToBuy.toFixed(4)),
                    price: Types.Decimal128.fromString(currentPrice.toFixed(2)),
                    amount: Types.Decimal128.fromString((-(costBasis + fee)).toFixed(2)),
                    fees: Types.Decimal128.fromString(fee.toFixed(2)),
                    feeType: 'COMMISSION',
                    executedAt: new Date(),
                 });
              }
            }
          }
          
          if (newTransactions.length > 0) {
             await Transaction.insertMany(newTransactions);
             await wallet.save();
          }

        } catch (error: any) {
          console.error(`[Paper Trading] Error processing wallet ${walletObj._id}:`, error);
          if (wallet) {
            wallet.status = 'error';
            wallet.lastError = error.message || 'Unknown error';
            await wallet.save();
          }
        }
      });
    }
  }
);
