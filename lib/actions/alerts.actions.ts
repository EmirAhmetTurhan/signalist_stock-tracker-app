'use server';

import { connectToDatabase } from '@/database/mongoose';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import PriceAlert from '@/database/models/price-alert.model';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

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

    if (!symbol || !Number.isFinite(threshold)) {
      return;
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
    console.error('createPriceAlertAction error', e);
    redirect('/watchlist');
  }
}

export async function getUserAlerts(): Promise<Alert[]> {
  try {
    await connectToDatabase();
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
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
    console.error('getUserAlerts error', e);
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
    if (!alertId || !Number.isFinite(threshold)) return;

    await PriceAlert.updateOne({ _id: alertId, userId }, { $set: { threshold }, $unset: { lastNotifiedOn: '' } });
    revalidatePath('/watchlist');
    redirect('/watchlist');
  } catch (e) {
    console.error('updateAlertThresholdAction error', e);
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
    console.error('deleteAlertAction error', e);
    redirect('/watchlist');
  }
}
