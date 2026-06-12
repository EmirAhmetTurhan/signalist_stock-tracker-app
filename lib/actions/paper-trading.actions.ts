'use server';

import { auth } from '@/lib/better-auth/auth';
import { connectToDatabase } from '@/database/mongoose';
import Wallet from '@/database/models/wallet.model';
import Position from '@/database/models/position.model';
import Transaction from '@/database/models/transaction.model';
import { Types } from 'mongoose';
import { getCurrentPrice } from '@/lib/actions/finnhub/quote';
import { simulateTrade, DEFAULT_RISK_CONFIG } from '@/lib/ta/simulation/trade-simulator';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

export async function depositWithdrawAction(walletId: string, amount: number, type: 'DEPOSIT' | 'WITHDRAW') {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) throw new Error('Unauthorized');

    await connectToDatabase();
    const wallet = await Wallet.findById(walletId);
    if (!wallet || wallet.userId !== session.user.id) throw new Error('Wallet not found');

    const amountDecimal = Types.Decimal128.fromString(amount.toFixed(2));
    const equityBefore = wallet.totalEquity;

    wallet.capitalInjections.push({
      type,
      amount: amountDecimal,
      equityBeforeInjection: equityBefore,
      date: new Date()
    });

    const cashFloat = parseFloat(wallet.cashBalance.toString());
    const equityFloat = parseFloat(wallet.totalEquity.toString());

    if (type === 'DEPOSIT') {
      wallet.cashBalance = Types.Decimal128.fromString((cashFloat + amount).toFixed(2));
      wallet.totalEquity = Types.Decimal128.fromString((equityFloat + amount).toFixed(2));
    } else {
      if (cashFloat < amount) throw new Error('Insufficient cash balance');
      wallet.cashBalance = Types.Decimal128.fromString((cashFloat - amount).toFixed(2));
      wallet.totalEquity = Types.Decimal128.fromString((equityFloat - amount).toFixed(2));
    }

    await wallet.save();

    await Transaction.create({
      walletId: wallet._id,
      userId: session.user.id,
      type,
      subType: null,
      symbol: 'USD',
      quantity: 1,
      price: amount,
      amount: type === 'DEPOSIT' ? amount : -amount,
      fees: 0,
      feeType: 'NONE',
      executedAt: new Date()
    });

    revalidatePath('/portfolio');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function closePositionAction(positionId: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) throw new Error('Unauthorized');

    await connectToDatabase();
    const position = await Position.findById(positionId);
    if (!position || position.userId !== session.user.id) throw new Error('Position not found');
    if (position.status !== 'open') throw new Error('Position is already closed');

    const wallet = await Wallet.findById(position.walletId);
    if (!wallet) throw new Error('Wallet not found');

    const currentPrice = await getCurrentPrice(position.symbol);
    if (!currentPrice) throw new Error('Failed to fetch current price');

    const entryPrice = parseFloat(position.avgEntryPrice.toString());
    const qty = parseFloat(position.quantity.toString());
    const costBasis = parseFloat(position.costBasis.toString());
    
    const pnl = position.side === 'LONG' 
        ? (currentPrice - entryPrice) * qty 
        : (entryPrice - currentPrice) * qty;
    
    const fee = parseFloat(position.costBasis.toString()) * 0.001; // 0.1% fee simulation

    position.status = 'closed';
    position.closedAt = new Date();
    position.realizedPnl = Types.Decimal128.fromString(pnl.toFixed(2));
    position.exitReason = 'manual';
    await position.save();

    const walletTotalEquity = parseFloat(wallet.totalEquity.toString());
    wallet.totalEquity = Types.Decimal128.fromString((walletTotalEquity + pnl - fee).toFixed(2));
    wallet.cashBalance = wallet.totalEquity; // Simplified cash handling
    await wallet.save();

    await Transaction.create({
      walletId: wallet._id,
      userId: session.user.id,
      positionId: position._id,
      type: position.side === 'LONG' ? 'SELL' : 'BUY',
      subType: 'FULL_CLOSE',
      symbol: position.symbol,
      quantity: qty,
      price: currentPrice,
      amount: (currentPrice * qty) - fee,
      fees: fee,
      feeType: 'COMMISSION',
      realizedPnl: pnl,
      metadata: { exitReason: 'manual' },
      executedAt: new Date()
    });

    revalidatePath('/portfolio');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateStrategyAllocationAction(walletId: string, strategyPortfolio: any[], activeSymbols: string[]) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) throw new Error('Unauthorized');

    await connectToDatabase();
    const wallet = await Wallet.findById(walletId);
    if (!wallet || wallet.userId !== session.user.id) throw new Error('Wallet not found');

    wallet.strategyPortfolio = strategyPortfolio;
    wallet.activeSymbols = activeSymbols;
    await wallet.save();

    revalidatePath('/portfolio');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
