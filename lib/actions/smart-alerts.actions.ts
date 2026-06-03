'use server';

import { connectToDatabase } from '@/database/mongoose';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import { SmartAlert } from '@/database/models/smart-alert.model';
import type { Timeframe } from '@/lib/ta/types';

export async function createSmartAlert(input: {
  name: string;
  symbol: string;
  interval: Timeframe;
  frequency: 'daily' | '4h';
  conditions: Array<{ indicator: string; operator: '<' | '>' | 'cross_above' | 'cross_below'; value: number }>;
  overrideUserId?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    await connectToDatabase();
    let userId = input.overrideUserId;
    let userEmail = 'unknown@example.com';
    if (!userId) {
      const session = await auth.api.getSession({ headers: await headers() });
      const user = session?.user;
      userId = user?.id;
      userEmail = user?.email || userEmail;
    }
    if (!userId) {
      return { success: false, error: 'Not authenticated' };
    }

    const doc = await SmartAlert.create({
      userId: userId,
      email: userEmail,
      name: input.name,
      symbol: input.symbol,
      interval: input.interval,
      frequency: input.frequency,
      conditions: input.conditions,
    });

    return { success: true, id: String(doc._id) };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getSmartAlerts(symbol?: string, overrideUserId?: string): Promise<{ success: boolean; alerts?: Array<Record<string, unknown>>; error?: string }> {
  try {
    await connectToDatabase();
    let userId = overrideUserId;
    if (!userId) {
      const session = await auth.api.getSession({ headers: await headers() });
      userId = session?.user?.id;
    }
    if (!userId) return { success: false, error: 'Not authenticated' };

    const filter: Record<string, unknown> = { userId, active: true };
    if (symbol) filter.symbol = symbol.toUpperCase();

    const items = await SmartAlert.find(filter).sort({ createdAt: -1 }).lean();
    const alerts = items.map((a) => ({
      id: String(a._id),
      name: a.name,
      symbol: a.symbol,
      interval: a.interval,
      frequency: a.frequency,
      conditions: a.conditions,
      active: a.active,
      lastTriggeredAt: a.lastTriggeredAt,
    }));

    return { success: true, alerts };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
