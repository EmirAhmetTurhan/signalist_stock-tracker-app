'use server';

import { connectToDatabase } from '@/database/mongoose';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import PriceAlert from '@/database/models/price-alert.model';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createAlertSchema, updateAlertSchema, validate } from '@/lib/validations/schemas';

function logError(context: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Alerts] ${context}: ${message}`);
}

export async function createPriceAlertAction(formData: FormData) {
  try {
    await connectToDatabase();
    const session = await auth.api.getSession({ headers: await headers() });
    const user = session?.user;
    if (!user?.id || !user?.email) {
      return;
    }

    const symbol = String(formData.get('symbol') || '').toUpperCase().trim();
    const company = String(formData.get('company') || symbol).trim();
    const alertName = String(formData.get('alertName') || `${symbol} Price Alert`).trim();
    const condition = String(formData.get('condition') || 'greater');
    const thresholdStr = String(formData.get('threshold') || '');
    const threshold = Number(thresholdStr.replace(/[^0-9.\-]/g, ''));
    const alertType: 'upper' | 'lower' = condition === 'less' ? 'lower' : 'upper';

    const parsed = validate(createAlertSchema, { symbol, company, alertName, alertType, threshold });
    if (!parsed.success) {
      logError('Validation failed', parsed.error);
      redirect('/watchlist');
    }

    await PriceAlert.create({
      userId: user.id,
      email: user.email,
      symbol,
      company: company || symbol,
      alertName,
      alertType,
      threshold,
      frequency: 'daily',
      active: true,
    });

    redirect('/watchlist');
  } catch (e) {
    logError('createPriceAlertAction error', e);
    redirect('/watchlist');
  }
}

export async function createAlert(input: {
  symbol: string;
  company: string;
  alertName: string;
  alertType: 'upper' | 'lower';
  threshold: number;
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

    const parsed = validate(createAlertSchema, input);
    if (!parsed.success) return { success: false, error: parsed.error };

    const doc = await PriceAlert.create({
      userId: userId,
      email: userEmail,
      symbol: parsed.data.symbol,
      company: parsed.data.company,
      alertName: parsed.data.alertName,
      alertType: parsed.data.alertType,
      threshold: parsed.data.threshold,
      frequency: 'daily',
      active: true,
    });

    return { success: true, id: String(doc._id) };
  } catch (e) {
    logError('createAlert', e);
    return { success: false, error: String(e) };
  }
}

export async function deleteAlert(symbol: string, overrideUserId?: string): Promise<{ success: boolean; deletedCount?: number; error?: string }> {
  try {
    await connectToDatabase();
    let userId = overrideUserId;
    if (!userId) {
      const session = await auth.api.getSession({ headers: await headers() });
      userId = session?.user?.id;
    }
    if (!userId) return { success: false, error: 'Not authenticated' };

    const result = await PriceAlert.deleteOne({ userId, symbol: symbol.toUpperCase() });
    return { success: true, deletedCount: result.deletedCount };
  } catch (e) {
    logError('deleteAlert', e);
    return { success: false, error: String(e) };
  }
}

export async function getUserAlerts(overrideUserId?: string): Promise<Alert[]> {
  try {
    await connectToDatabase();
    let userId = overrideUserId;
    if (!userId) {
      const session = await auth.api.getSession({ headers: await headers() });
      userId = session?.user?.id;
    }
    if (!userId) return [] as Alert[];

    const items = await PriceAlert.find({ userId, active: true }).sort({ createdAt: -1 }).lean();
    return (items || []).map((a) => ({
      id: String(a._id),
      symbol: String(a.symbol),
      company: String(a.company),
      alertName: String(a.alertName),
      currentPrice: 0,
      alertType: a.alertType === 'lower' ? 'lower' : 'upper',
      threshold: Number(a.threshold),
    }));
  } catch (e) {
    logError('getUserAlerts error', e);
    return [] as Alert[];
  }
}

export async function updateAlertThresholdAction(formData: FormData) {
  try {
    await connectToDatabase();
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return;

    const alertId = String(formData.get('alertId') || '').trim();
    const thresholdStr = String(formData.get('threshold') || '').trim();
    const threshold = Number(thresholdStr.replace(/[^0-9.\-]/g, ''));

    const parsed = validate(updateAlertSchema, { alertId, threshold });
    if (!parsed.success) {
      logError('Validation failed', parsed.error);
      redirect('/watchlist');
    }

    await PriceAlert.updateOne(
      { _id: alertId, userId },
      { $set: { threshold: parsed.data.threshold }, $unset: { lastNotifiedOn: '' } }
    );
    revalidatePath('/watchlist');
    redirect('/watchlist');
  } catch (e) {
    logError('updateAlertThresholdAction error', e);
    redirect('/watchlist');
  }
}

export async function deleteAlertAction(formData: FormData) {
  try {
    await connectToDatabase();
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return;

    const alertId = String(formData.get('alertId') || '').trim();
    if (!alertId) return;

    await PriceAlert.deleteOne({ _id: alertId, userId });
    revalidatePath('/watchlist');
    redirect('/watchlist');
  } catch (e) {
    logError('deleteAlertAction error', e);
    redirect('/watchlist');
  }
}
