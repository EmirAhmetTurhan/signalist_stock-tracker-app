'use server';

import { connectToDatabase } from '@/database/mongoose';
import ForwardTestStrategy from '@/database/models/forward-test-strategy.model';
import { toDecimal128, fromDecimal128 } from '@/lib/paper-trading/decimal-utils';
import { revalidatePath } from 'next/cache';
import type { Timeframe } from '@/lib/ta/types';

// ============================================================
// Create Forward Test
// ============================================================

export async function createForwardTest(input: {
  userId: string;
  name: string;
  symbol: string;
  interval: Timeframe;
  indicatorConfig: any;
  entryRule: any;
  exitRule: any;
  positionSizing: { mode: 'fixed_cash' | 'percent_portfolio' | 'fixed_shares'; value: number };
  executionMode: 'shadow' | 'auto' | 'propose_only';
  capitalAllocated: number;
}) {
  if (!input.userId) return { success: false, error: 'Oturum bulunamadı.' };

  try {
    await connectToDatabase();

    const newStrategy = await ForwardTestStrategy.create({
      userId: input.userId,
      name: input.name,
      symbol: input.symbol.toUpperCase(),
      interval: input.interval,
      indicatorConfig: input.indicatorConfig,
      entryRule: input.entryRule,
      exitRule: input.exitRule,
      positionSizing: input.positionSizing,
      executionMode: input.executionMode,
      status: 'running',
      capitalAllocated: toDecimal128(input.capitalAllocated),
      shadowPnl: toDecimal128(0),
    });

    revalidatePath('/portfolio');
    revalidatePath('/ta');

    return { success: true, strategyId: newStrategy._id.toString() };
  } catch (e) {
    console.error('[ForwardTestActions] create error:', e);
    return { success: false, error: 'Strateji oluşturulurken bir hata oluştu.' };
  }
}

// ============================================================
// Get User Forward Tests
// ============================================================

export async function getForwardTests(userId: string) {
  if (!userId) return { success: false, data: [] };

  try {
    await connectToDatabase();

    const strategies = await ForwardTestStrategy.find({ userId }).sort({ createdAt: -1 }).lean();

    const formatted = strategies.map(s => ({
      id: s._id.toString(),
      name: s.name,
      symbol: s.symbol,
      interval: s.interval,
      executionMode: s.executionMode,
      status: s.status,
      capitalAllocated: fromDecimal128(s.capitalAllocated),
      shadowPnl: fromDecimal128(s.shadowPnl),
      shadowTrades: s.shadowTrades,
      signalsLogged: s.signalsLogged,
      tradesExecuted: s.tradesExecuted,
      createdAt: s.createdAt?.toISOString(),
      lastEvaluatedAt: s.lastEvaluatedAt?.toISOString(),
    }));

    return { success: true, data: formatted };
  } catch (e) {
    console.error('[ForwardTestActions] get error:', e);
    return { success: false, error: 'Stratejiler yüklenirken hata oluştu.' };
  }
}

// ============================================================
// Change Status
// ============================================================

export async function changeForwardTestStatus(userId: string, id: string, status: 'running' | 'paused' | 'stopped') {
  try {
    await connectToDatabase();

    // Validate authorization and find the strategy
    const strategy = await ForwardTestStrategy.findOne({ _id: id, userId });
    if (!strategy) return { success: false, error: 'Strategy not found' };

    // Update status
    strategy.status = status;
    await strategy.save();

    revalidatePath('/portfolio');
    revalidatePath('/ta');
    return { success: true };
  } catch (e) {
    console.error('Error changing forward test status:', e);
    return { success: false, error: 'Failed to update status' };
  }
}

export async function changeForwardTestMode(userId: string, id: string, mode: 'shadow' | 'auto' | 'propose_only', confirmationText?: string) {
  try {
    await connectToDatabase();

    const strategy = await ForwardTestStrategy.findOne({ _id: id, userId });
    if (!strategy) return { success: false, error: 'Strategy not found' };

    if (mode === 'auto' && confirmationText !== strategy.name) {
      return { success: false, error: 'Onay metni strateji adıyla eşleşmiyor.' };
    }

    strategy.executionMode = mode;
    await strategy.save();

    revalidatePath('/portfolio');
    revalidatePath('/ta');
    return { success: true };
  } catch (e) {
    console.error('Error changing forward test mode:', e);
    return { success: false, error: 'Failed to update execution mode' };
  }
}
