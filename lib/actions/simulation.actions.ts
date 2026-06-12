'use server';

import { connectToDatabase } from '@/database/mongoose';
import Simulation from '@/database/models/simulation.model';
import Wallet from '@/database/models/wallet.model';
import SavedStrategy from '@/database/models/saved-strategy.model';
import { inngest } from '@/lib/inngest/client';
import { Types } from 'mongoose';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import Position from '@/database/models/position.model';
import Transaction from '@/database/models/transaction.model';
import { revalidatePath } from 'next/cache';

export async function createSimulation(params: {
  name: string;
  initialBalance: number;
  startDate: string;
  endDate: string;
  testSymbol: string;
  benchmarkSymbol: string;
  interval: '1d' | '4h';
  positionSizingConfig: { type: string, value?: number };
  strategyPortfolio: any[];
}) {
  try {
    await connectToDatabase();
    // Retrieve session with better-auth
    const session = await auth.api.getSession({ headers: await headers() });
    
    if (!session?.user) {
      throw new Error('Unauthorized');
    }

    const userId = session.user.id;

    // DÜZELTME 7: Strategy Snapshot Authoritative
    const strategyIds = params.strategyPortfolio.map(s => s.originalStrategyId);
    const savedStrategies = await SavedStrategy.find({
      _id: { $in: strategyIds },
      userId: userId
    }).lean();

    if (savedStrategies.length !== strategyIds.length) {
      throw new Error('Strategy not found or unauthorized');
    }

    const validatedPortfolio = params.strategyPortfolio.map(clientItem => {
      const dbStrat = savedStrategies.find(s => s._id.toString() === clientItem.originalStrategyId.toString());
      if (!dbStrat) throw new Error('Strategy not found or unauthorized');

      return {
        originalStrategyId: dbStrat._id,
        weight: clientItem.weight,
        engineVersion: '1.0.0',
        indicators: (dbStrat.indicators || []).map((ind: string) => ({ name: ind })),
        bestParams: dbStrat.discoveredParams || {},
        riskProfile: {}
      };
    });

    // 1. Create Wallet specific to this simulation
    const wallet = await Wallet.create({
      userId,
      type: 'simulation',
      baseCurrency: 'USD',
      initialBalance: Types.Decimal128.fromString(params.initialBalance.toString()),
      totalEquity: Types.Decimal128.fromString(params.initialBalance.toString()),
      cashBalance: Types.Decimal128.fromString(params.initialBalance.toString()),
      reservedBalance: Types.Decimal128.fromString('0'),
      circuitBreakerTriggered: false,
      capitalInjections: []
    });

    // 2. Create Simulation Document
    const simulation = await Simulation.create({
      userId,
      walletId: wallet._id,
      status: 'queued',
      progress: 0,
      testSymbol: params.testSymbol,
      benchmarkSymbol: params.benchmarkSymbol,
      interval: params.interval,
      positionSizingConfig: params.positionSizingConfig,
      strategyPortfolio: validatedPortfolio,
      engineVersion: 'v1.0.0', // Production engine tag
      startDate: new Date(params.startDate),
      endDate: new Date(params.endDate),
      lastProcessedDate: null,
      equityCurve: [],
      benchmarkCurve: [],
      tradeHistory: []
    });

    // 3. Trigger Inngest Event — testSymbol for trades, benchmarkSymbol for comparison
    await inngest.send({
      name: 'simulation/run.started',
      data: {
        simulationId: simulation._id.toString(),
        userId,
        walletId: wallet._id.toString(),
        strategyPortfolio: validatedPortfolio,
        startDate: params.startDate,
        endDate: params.endDate,
        positionSizingConfig: params.positionSizingConfig,
        testSymbol: params.testSymbol,
        benchmarkSymbol: params.benchmarkSymbol,
        interval: params.interval
      }
    });

    return { 
      success: true, 
      simulationId: simulation._id.toString(), 
      walletId: wallet._id.toString() 
    };
  } catch (error: any) {
    console.error('[Simulation Action] Error creating simulation:', error);
    return { success: false, error: error.message };
  }
}

export async function getSimulationProgress(id: string) {
  try {
    await connectToDatabase();
    const sim = await Simulation.findById(id).select('status progress lastProcessedDate failedAt startDate endDate');
    if (!sim) return { success: false, error: 'Simulation not found' };

    return {
      success: true,
      data: {
        status: sim.status,
        progress: sim.progress,
        lastProcessedDate: sim.lastProcessedDate,
        failedAt: sim.failedAt,
        startDate: sim.startDate,
        endDate: sim.endDate
      }
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteSimulation(simulationId: string) {
  try {
    await connectToDatabase();
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) throw new Error('Unauthorized');

    const sim = await Simulation.findById(simulationId);
    if (!sim) return { success: false, error: 'Simulation not found' };
    
    if (sim.userId.toString() !== session.user.id) {
      return { success: false, error: 'Unauthorized' };
    }

    // Delete related data
    await Transaction.deleteMany({ walletId: sim.walletId });
    await Position.deleteMany({ walletId: sim.walletId });
    await Wallet.findByIdAndDelete(sim.walletId);
    await Simulation.findByIdAndDelete(simulationId);

    revalidatePath('/portfolio/simulations');
    return { success: true };
  } catch (error: any) {
    console.error('[Simulation Action] Error deleting simulation:', error);
    return { success: false, error: error.message };
  }
}
