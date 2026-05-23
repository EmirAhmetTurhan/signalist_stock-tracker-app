'use server';

import { connectToDatabase } from '@/database/mongoose';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import { SmartAlert } from '@/database/models/smart-alert.model';

export async function createSmartAlert(input: {
  name: string;
  symbol: string;
  interval: '1d' | '4h';
  frequency: 'daily' | '4h' | '1h';
  conditions: Array<{ indicator: string; operator: '<' | '>' | 'cross_above' | 'cross_below'; value: number }>;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    await connectToDatabase();
    const session = await auth.api.getSession({ headers: await headers() });
    const user = session?.user;
    if (!user?.id || !user?.email) {
      return { success: false, error: 'Not authenticated' };
    }

    const doc = await SmartAlert.create({
      userId: user.id,
      email: user.email,
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

export async function getSmartAlerts(symbol?: string): Promise<{ success: boolean; alerts?: Array<Record<string, unknown>>; error?: string }> {
  try {
    await connectToDatabase();
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
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
