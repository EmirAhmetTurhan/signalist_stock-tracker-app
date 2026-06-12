import { inngest } from '@/lib/inngest/client';
import { connectToDatabase } from '@/database/mongoose';
import Simulation from '@/database/models/simulation.model';
import Wallet from '@/database/models/wallet.model';
import Position from '@/database/models/position.model';
import Transaction from '@/database/models/transaction.model';
import { Types } from 'mongoose';

// --- REAL PHASE 4 INTEGRATIONS ---
import { getCandlesForInterval } from '@/lib/actions/finnhub/candles';
import { computeIndicators, normalizeParams } from '@/lib/ta/compute';
import { extractTradeMarkers } from '@/lib/ta/signals';
import { simulateTrade, DEFAULT_RISK_CONFIG } from '@/lib/ta/simulation/trade-simulator';

export const runSimulation = inngest.createFunction(
  {
    id: 'run-simulation',
    name: 'Run Quantitative Portfolio Simulation',
    triggers: [{ event: 'simulation/run.started' }],
    retries: 3, 
    idempotency: 'event.data.simulationId',
    onFailure: async ({ error, event }) => {
      await connectToDatabase();
      const ev = (event as any).data?.event || event;
      const simId = ev?.data?.simulationId;
      if (simId) {
        console.error(`[Simulation] Chunk failed completely for ${simId}:`, error);
        await Simulation.findByIdAndUpdate(simId, {
          status: 'failed',
          failedAt: new Date(),
        });
      }
    }
  },
  async ({ event, step }) => {
    const {
      simulationId, userId, walletId, strategyPortfolio,
      startDate: startDateStr, endDate: endDateStr, positionSizingConfig, testSymbol, benchmarkSymbol, interval
    } = event.data as any;

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);

    await connectToDatabase();

    const setup = await step.run('setup-simulation', async () => {
      const sim = await Simulation.findById(simulationId);
      if (!sim) throw new Error('Simulation not found');
      
      if (sim.status !== 'queued' && sim.status !== 'failed') {
        return { abort: true, reason: 'Simulation is already running or completed.', totalDays: 0, chunkSize: 0 };
      }

      sim.status = 'running';
      sim.progress = 0;
      sim.failedAt = undefined;
      await sim.save();

      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      return { abort: false, totalDays, chunkSize: 90, reason: '' };
    });

    if (setup.abort) return;

    let currentStart = new Date(startDate);

    const resumeCheck = await step.run('check-resume', async () => {
      const sim = await Simulation.findById(simulationId).select('lastProcessedDate');
      return sim?.lastProcessedDate ? new Date(sim.lastProcessedDate).toISOString() : null;
    });

    if (resumeCheck) {
      currentStart = new Date(resumeCheck);
    }

    let chunkIndex = 0;
    while (currentStart < endDate) {
      let currentEnd = new Date(currentStart);
      currentEnd.setDate(currentEnd.getDate() + setup.chunkSize);
      if (currentEnd > endDate) currentEnd = endDate;

      const stepStartStr = currentStart.toISOString();
      const stepEndStr = currentEnd.toISOString();
      const currentChunkIndex = chunkIndex++;
      const chunkKey = `${stepStartStr}_${stepEndStr}`;

      await step.run(`process-chunk-${currentChunkIndex}`, async () => {
        console.log(`[Simulation] Processing chunk from ${stepStartStr} to ${stepEndStr} (${chunkKey})`);
        
        await connectToDatabase();
        const sim = await Simulation.findById(simulationId);
        if (!sim) throw new Error('Simulation not found');

        if (sim.processedChunks && sim.processedChunks.includes(chunkKey)) {
          console.log(`[Simulation] Chunk ${chunkKey} already processed. Skipping.`);
          return;
        }

        const wallet = await Wallet.findById(walletId);
        if (!wallet) throw new Error('Wallet not found');

        // Fetch candles with look-ahead (for trades) and look-behind (for indicators)
        const bufferDays = 40; 
        const lookbehindDays = 60; 
        const totalChunkDays = setup.chunkSize + bufferDays + lookbehindDays;
        
        const fetchEnd = new Date(currentEnd);
        fetchEnd.setDate(fetchEnd.getDate() + bufferDays);
        if (fetchEnd > endDate) fetchEnd.setTime(endDate.getTime());
        
        const fetchEndTime = fetchEnd.getTime() / 1000;
        // Fetch candles for the TEST symbol (what we're trading), NOT the benchmark
        const tradeSymbol = testSymbol || benchmarkSymbol; // Fallback for legacy simulations without testSymbol
        const tradeInterval = interval || '1d'; // Fallback for legacy simulations without interval
        const candles = await getCandlesForInterval(tradeSymbol, tradeInterval, totalChunkDays, fetchEndTime);
        
        if (candles.length === 0) return;

        // Compute Indicators
        const activeIndicators = new Set<string>();
        let mergedParams = { ...DEFAULT_RISK_CONFIG };
        for (const s of strategyPortfolio) {
          if (s.indicators) {
            for (const ind of s.indicators) {
              if (ind.name) activeIndicators.add(ind.name);
            }
          }
          if (s.params) {
            mergedParams = { ...mergedParams, ...s.params };
          }
        }
        
        const computed = computeIndicators(candles, activeIndicators, normalizeParams(mergedParams));
        const markers = extractTradeMarkers(computed, candles, activeIndicators);
        
        const markerMap = new Map<number, { count: number, buys: number, sells: number }>();
        for (const m of markers) {
           const time = m.time as number;
           if (!markerMap.has(time)) markerMap.set(time, { count: 0, buys: 0, sells: 0 });
           const entry = markerMap.get(time)!;
           entry.count++;
           if (m.signal === 'BUY') entry.buys++;
           else if (m.signal === 'SELL') entry.sells++;
        }
        
        const signalsByIndex = new Map<number, 'BUY' | 'SELL'>();
        for (let i = 0; i < candles.length; i++) {
           const barTime = candles[i].time as number;
           if (markerMap.has(barTime)) {
               const entry = markerMap.get(barTime)!;
               if (entry.buys > entry.sells) signalsByIndex.set(i, 'BUY');
               else if (entry.sells > entry.buys) signalsByIndex.set(i, 'SELL');
           }
        }

        const atrValues = new Array(candles.length).fill(0);
        for (let i=1; i<candles.length; i++) {
            atrValues[i] = Math.max(
                candles[i].high - candles[i].low,
                Math.abs(candles[i].high - candles[i-1].close),
                Math.abs(candles[i].low - candles[i-1].close)
            );
        }

        const stepStartTime = new Date(stepStartStr).getTime() / 1000;
        const stepEndTime = new Date(stepEndStr).getTime() / 1000;
        
        let startIndex = candles.findIndex(c => c.time >= stepStartTime);
        if (startIndex === -1) startIndex = 0;
        let endIndex = candles.findIndex(c => c.time >= stepEndTime);
        if (endIndex === -1) endIndex = candles.length - 1;

        const newTransactions: any[] = [];
        let peakEquity = parseFloat(wallet.totalEquity.toString());
        let currentDrawdown = 0;
        let skipUntilIndex = -1;

        for (let i = startIndex; i <= endIndex; i++) {
          if (i <= skipUntilIndex) continue;

          const bar = candles[i];
          const totalEquityNum = parseFloat(wallet.totalEquity.toString());
          const initialNum = parseFloat(wallet.initialBalance.toString());
          
          if (totalEquityNum <= initialNum * 0.10) { 
             console.log('[Simulation] Bankruptcy circuit breaker triggered. Force Liquidation.');
             wallet.circuitBreakerTriggered = true;
             await wallet.save();
             break; 
          }

          const action = signalsByIndex.get(i);

          if (action) {
            console.log(`[Simulation] Opened ${action} signal at ${bar.close} on ${new Date((bar.time as number)*1000).toISOString()}`);
            
            const tradeResult = simulateTrade(candles, i, action, atrValues, {
               ...DEFAULT_RISK_CONFIG,
               ...positionSizingConfig 
            });

            const costBasis = bar.close * 1; // Simulation fixed 1 share default
            const pnl = costBasis * (tradeResult.realizedReturnPct / 100);
            const fee = costBasis * 0.001; 
            
            newTransactions.push({
               walletId: wallet._id,
               userId: userId,
               positionId: null,
               type: action,
               subType: 'OPEN',
               symbol: tradeSymbol,
               quantity: 1,
               price: bar.close,
               amount: -(costBasis + fee),
               fees: fee,
               feeType: 'COMMISSION',
               executedAt: new Date((bar.time as number) * 1000),
            });

            const exitBar = candles[tradeResult.exitIndex];
            newTransactions.push({
               walletId: wallet._id,
               userId: userId,
               positionId: null,
               type: action === 'BUY' ? 'SELL' : 'BUY',
               subType: 'FULL_CLOSE',
               symbol: tradeSymbol,
               quantity: 1,
               price: exitBar.close,
               amount: (exitBar.close * 1) - fee,
               fees: fee,
               feeType: 'COMMISSION',
               realizedPnl: pnl,
               metadata: { exitReason: tradeResult.exitReason, mfe: tradeResult.mfe, mae: tradeResult.mae },
               executedAt: new Date((exitBar.time as number) * 1000),
            });

            wallet.totalEquity = Types.Decimal128.fromString((totalEquityNum + pnl - fee * 2).toFixed(2));
            wallet.cashBalance = wallet.totalEquity;

            const newEquityNum = parseFloat(wallet.totalEquity.toString());
            if (newEquityNum > peakEquity) peakEquity = newEquityNum;
            currentDrawdown = peakEquity > 0 ? ((peakEquity - newEquityNum) / peakEquity) * 100 : 0;

            skipUntilIndex = tradeResult.exitIndex;
          }
        }

        // Clean up any previously inserted transactions for this chunk to prevent double insertion on retries
        await Transaction.deleteMany({ walletId: wallet._id, 'metadata.chunkKey': chunkKey });

        const newTransactionsTagged = newTransactions.map(tx => ({
          ...tx,
          metadata: { ...tx.metadata, chunkKey }
        }));

        if (newTransactionsTagged.length > 0) {
          await Transaction.insertMany(newTransactionsTagged);
        }

        const processedDays = Math.ceil((new Date(stepEndStr).getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        const progress = Math.min(100, Math.round((processedDays / setup.totalDays) * 100));

        const equityPoint = {
          t: new Date(stepEndStr),
          eq: wallet.totalEquity,
          c: wallet.cashBalance,
          dd: currentDrawdown
        };

        const tradeHistoryItems = newTransactions.map(tx => ({ 
          transactionId: tx._id, t: tx.executedAt, symbol: tx.symbol, 
          type: tx.type, quantity: tx.quantity, price: tx.price, 
          realizedPnl: tx.realizedPnl, exitReason: tx.metadata?.exitReason || null 
        }));

        await Simulation.updateOne(
          { _id: sim._id },
          { 
            $set: { progress: progress, lastProcessedDate: new Date(stepEndStr) },
            $push: { 
              equityCurve: equityPoint,
              tradeHistory: { $each: tradeHistoryItems },
              processedChunks: chunkKey
            } 
          }
        );
      });

      currentStart = currentEnd;
    }

    // F) FINALIZATION
    await step.run('finalize-simulation', async () => {
      console.log(`[Simulation] Finalizing simulation ${simulationId}`);
      await connectToDatabase();
      const sim = await Simulation.findById(simulationId);
      const wallet = await Wallet.findById(walletId);
      if (!sim || !wallet) throw new Error('Simulation/Wallet not found');

      const initialCapital = parseFloat(wallet.initialBalance.toString());
      const finalEquity = parseFloat(wallet.totalEquity.toString());

      // DÜZELTME 2: TWR (Time-Weighted Return)
      const injections = (wallet.capitalInjections || []).slice().sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      let twrMultiplier = 1;
      let previousEquity = initialCapital;

      for (const injection of injections) {
        const equityBefore = parseFloat(injection.equityBeforeInjection.toString());
        const subPeriodReturn = previousEquity > 0 ? (equityBefore - previousEquity) / previousEquity : 0;
        twrMultiplier *= (1 + subPeriodReturn);
        previousEquity = equityBefore + parseFloat(injection.amount.toString());
      }
      const finalSubPeriodReturn = previousEquity > 0 ? (finalEquity - previousEquity) / previousEquity : 0;
      twrMultiplier *= (1 + finalSubPeriodReturn);
      const twr = (twrMultiplier - 1) * 100;

      const years = setup.totalDays / 365.25;
      const cagrVal = (years > 0 && twrMultiplier > 0) ? (Math.pow(twrMultiplier, 1 / years) - 1) * 100 : 0;

      const equityCurve = sim.equityCurve;
      let returns: number[] = [];
      let maxDd = 0;
      let peak = initialCapital;

      for (let i = 1; i < equityCurve.length; i++) {
        const prevEq = parseFloat(equityCurve[i-1].eq.toString());
        const currEq = parseFloat(equityCurve[i].eq.toString());
        
        if (currEq > peak) peak = currEq;
        const dd = peak > 0 ? ((peak - currEq) / peak) * 100 : 0;
        if (dd > maxDd) maxDd = dd;
      }

      // Populate basic returns for risk metric computations
      for (let i = 1; i < equityCurve.length; i++) {
        const prevEq = parseFloat(equityCurve[i-1].eq.toString());
        const currEq = parseFloat(equityCurve[i].eq.toString());
        returns.push(prevEq > 0 ? (currEq - prevEq) / prevEq : 0);
      }

      const meanReturn = returns.reduce((a,b)=>a+b, 0) / (returns.length || 1);
      const stdReturn = Math.sqrt(returns.map(x => Math.pow(x - meanReturn, 2)).reduce((a,b)=>a+b,0) / (returns.length || 1));
      const downsideReturns = returns.filter(r => r < 0);
      const downsideStd = Math.sqrt(downsideReturns.map(x => Math.pow(x, 2)).reduce((a,b)=>a+b,0) / (downsideReturns.length || 1));

      // Annualization factor: 252 trading days/year for 1d, ~378 bars/year for 4h (1.5 bars/day × 252)
      const barsPerYear = (interval || '1d') === '4h' ? 378 : 252;
      const annualizationFactor = Math.sqrt(barsPerYear);
      const sharpeRatioVal = stdReturn !== 0 ? (meanReturn / stdReturn) * annualizationFactor : 0;
      const sortinoRatioVal = downsideStd !== 0 ? (meanReturn / downsideStd) * annualizationFactor : 0;

      let grossProfit = 0;
      let grossLoss = 0;
      let wins = 0;
      let totalSignals = sim.tradeHistory.length;

      sim.tradeHistory.forEach((trade: any) => {
        if (trade.realizedPnl != null) {
          const pnl = parseFloat(trade.realizedPnl.toString());
          if (pnl > 0) { grossProfit += pnl; wins++; }
          else { grossLoss += Math.abs(pnl); }
        }
      });

      const winRateVal = totalSignals > 0 ? (wins / totalSignals) * 100 : 0;
      const profitFactorVal = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 999 : 0);

      const exitReasonMap = new Map<string, number>();
      sim.tradeHistory.forEach((trade: any) => {
        if (trade.exitReason != null) {
           const count = exitReasonMap.get(trade.exitReason) || 0;
           exitReasonMap.set(trade.exitReason, count + 1);
        }
      });

      // DÜZELTME 3: Benchmark & CAPM Alpha/Beta
      // Benchmark uses same interval as strategy (Alpha/Beta needs matching time resolution)
      const benchmarkInterval = interval || '1d';
      const benchmarkCandles = await getCandlesForInterval(benchmarkSymbol, benchmarkInterval, setup.totalDays, new Date(endDateStr).getTime() / 1000);
      
      let benchmarkCurve: any[] = [];
      let alphaVal = 0;
      let betaVal = 0;
      let benchmarkUnavailable = false;

      if (benchmarkCandles.length === 0) {
        benchmarkUnavailable = true;
      } else {
        let benchmarkEquity = initialCapital;
        benchmarkCurve = benchmarkCandles.map((bar, i) => {
          // close-to-close daily return
          const dailyReturn = i > 0 && benchmarkCandles[i-1].close > 0 ? (bar.close - benchmarkCandles[i-1].close) / benchmarkCandles[i-1].close : 0;
          benchmarkEquity *= (1 + dailyReturn);
          return { 
            t: new Date((bar.time as number)*1000), 
            eq: Types.Decimal128.fromString(benchmarkEquity.toFixed(2)), 
            c: Types.Decimal128.fromString(benchmarkEquity.toFixed(2)), 
            dd: 0 
          };
        });

        // Date-Keyed Join
        const strategyReturnsMap = new Map<string, number>();
        for (let i = 1; i < equityCurve.length; i++) {
          const prevEq = parseFloat(equityCurve[i-1].eq.toString());
          const currEq = parseFloat(equityCurve[i].eq.toString());
          const retVal = prevEq > 0 ? (currEq - prevEq) / prevEq : 0;
          const dateKey = new Date(equityCurve[i].t).toISOString().slice(0, 10);
          strategyReturnsMap.set(dateKey, retVal);
        }

        const benchmarkReturnsMap = new Map<string, number>();
        for (let i = 1; i < benchmarkCandles.length; i++) {
          const prevClose = benchmarkCandles[i-1].close;
          const currClose = benchmarkCandles[i].close;
          const retVal = prevClose > 0 ? (currClose - prevClose) / prevClose : 0;
          const dateKey = new Date((benchmarkCandles[i].time as number) * 1000).toISOString().slice(0, 10);
          benchmarkReturnsMap.set(dateKey, retVal);
        }

        const alignedStrategyReturns: number[] = [];
        const alignedBenchmarkReturns: number[] = [];

        for (const [dateKey, stratRet] of strategyReturnsMap.entries()) {
          if (benchmarkReturnsMap.has(dateKey)) {
            alignedStrategyReturns.push(stratRet);
            alignedBenchmarkReturns.push(benchmarkReturnsMap.get(dateKey)!);
          }
        }

        const meanAlignStrategyReturn = alignedStrategyReturns.reduce((a,b) => a+b, 0) / (alignedStrategyReturns.length || 1);
        const meanAlignBenchmarkReturn = alignedBenchmarkReturns.reduce((a,b) => a+b, 0) / (alignedBenchmarkReturns.length || 1);

        // covariance
        let covariance = 0;
        for (let i = 0; i < alignedStrategyReturns.length; i++) {
          covariance += (alignedStrategyReturns[i] - meanAlignStrategyReturn) * (alignedBenchmarkReturns[i] - meanAlignBenchmarkReturn);
        }
        covariance /= (alignedStrategyReturns.length || 1);

        // variance
        let variance = 0;
        for (let i = 0; i < alignedBenchmarkReturns.length; i++) {
          variance += Math.pow(alignedBenchmarkReturns[i] - meanAlignBenchmarkReturn, 2);
        }
        variance /= (alignedBenchmarkReturns.length || 1);

        betaVal = variance !== 0 ? covariance / variance : 0;

        // dailyRiskFreeRate = 0.04 / 252 ≈ 0.00015873 (4% annual risk free rate)
        const dailyRiskFreeRate = 0.00015873;
        const dailyAlpha = meanAlignStrategyReturn - (dailyRiskFreeRate + betaVal * (meanAlignBenchmarkReturn - dailyRiskFreeRate));
        alphaVal = dailyAlpha * 252;
      }

      // NaN Guard helper
      const guard = (v: number) => Number.isFinite(v) ? v : 0;

      const finalMetrics = {
        totalReturn: Types.Decimal128.fromString(guard(twr).toFixed(4)),
        totalSignals,
        exitReasonBreakdown: Object.fromEntries(exitReasonMap),
        winRate: guard(winRateVal),
        sharpeRatio: guard(sharpeRatioVal),
        sortinoRatio: guard(sortinoRatioVal),
        maxDrawdown: guard(maxDd),
        cagr: guard(cagrVal),
        alpha: guard(alphaVal),
        beta: guard(betaVal),
        profitFactor: guard(profitFactorVal)
      };

      await Simulation.updateOne(
        { _id: sim._id },
        { 
          $set: { 
            status: 'completed', 
            progress: 100, 
            finalMetrics: finalMetrics,
            benchmarkCurve: benchmarkCurve,
            benchmarkUnavailable: benchmarkUnavailable
          }
        }
      );
    });
  }
);
