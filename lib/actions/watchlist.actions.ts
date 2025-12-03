'use server';

import { connectToDatabase } from '@/database/mongoose';
import Watchlist from '@/database/models/watchlist.model';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';

export async function getWatchlistSymbolsByEmail(email: string): Promise<string[]> {
  try {
    if (!email) return [];

    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;
    if (!db) throw new Error('MongoDB connection not found');

    // Find the user in Better Auth collection
    const user = await db.collection('user').findOne<{ _id: unknown; id?: string; email?: string }>({ email });

    if (!user) return [];

    const userId = (user.id as string) || String(user._id || '');
    if (!userId) return [];

    const items = await Watchlist.find({ userId }, { symbol: 1}).lean();
    return items.map((i) => String(i.symbol));
  } catch (err) {
    console.error('getWatchlistSymbolsByEmail error:', err);
    return [];
  }
}

export async function getCurrentUserWatchlist(): Promise<StockWithData[]> {
  try {
    await connectToDatabase();
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return [];

    const items = await Watchlist.find({ userId }, { _id: 0, userId: 1, symbol: 1, company: 1, addedAt: 1 })
      .sort({ addedAt: -1 })
      .lean();

    // Return minimal data; price and change will be handled by TradingView widget on the client
    return (items || []).map((i) => ({
      userId: String(i.userId),
      symbol: String(i.symbol).toUpperCase(),
      company: String(i.company),
      addedAt: new Date(i.addedAt || Date.now()),
    }));
  } catch (err) {
    console.error('getCurrentUserWatchlist error:', err);
    return [];
  }
}

export async function addToWatchlist(symbol: string, company: string): Promise<{ ok: boolean; added?: boolean; error?: string }> {
  try {
    if (!symbol || !company) return { ok: false, error: 'Missing symbol or company' };

    await connectToDatabase();
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return { ok: false, error: 'Not authenticated' };

    const upper = symbol.toUpperCase();
    try {
      await Watchlist.create({ userId, symbol: upper, company });
      return { ok: true, added: true };
    } catch (e) {
      // Handle duplicate key errors gracefully (already in watchlist)
      const msg = (e as Error)?.message || '';
      if (msg.includes('E11000') || msg.toLowerCase().includes('duplicate')) {
        return { ok: true, added: true };
      }
      console.error('addToWatchlist error:', e);
      return { ok: false, error: 'Failed to add to watchlist' };
    }
  } catch (err) {
    console.error('addToWatchlist fatal error:', err);
    return { ok: false, error: 'Internal error' };
  }
}

export async function removeFromWatchlist(symbol: string): Promise<{ ok: boolean; removed?: boolean; error?: string }> {
  try {
    if (!symbol) return { ok: false, error: 'Missing symbol' };

    await connectToDatabase();
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return { ok: false, error: 'Not authenticated' };

    const upper = symbol.toUpperCase();
    const res = await Watchlist.deleteOne({ userId, symbol: upper });
    return { ok: true, removed: res.deletedCount === 1 };
  } catch (err) {
    console.error('removeFromWatchlist error:', err);
    return { ok: false, error: 'Failed to remove from watchlist' };
  }
}

