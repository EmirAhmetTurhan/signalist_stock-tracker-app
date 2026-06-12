'use server';

import { connectToDatabase } from '@/database/mongoose';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import PriceAlert from '@/database/models/price-alert.model';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createAlertSchema, updateAlertSchema, validate } from '@/lib/validations/schemas';
import { logError } from '@/lib/utils/error-utils';

// ─── Input types ─────────────────────────────────────────────────────────────

export type CreateAlertInput = {
  symbol: string;
  company: string;
  alertName: string;
  alertType: 'upper' | 'lower';
  threshold: number;
  overrideUserId?: string;
};

export type DeleteAlertResult = { success: boolean; deletedCount?: number; error?: string };
export type CreateAlertResult = { success: boolean; id?: string; error?: string };

// ─── getSession helper ────────────────────────────────────────────────────────

async function getUserId(overrideUserId?: string): Promise<{ userId?: string; userEmail?: string }> {
  if (overrideUserId) return { userId: overrideUserId };
  const session = await auth.api.getSession({ headers: await headers() });
  return { userId: session?.user?.id, userEmail: session?.user?.email || 'unknown@example.com' };
}

// ─── createAlert — dual-path overload ─────────────────────────────────────────
// FormData path (server action, redirects)  → <form action={createAlert}>
// JSON path (programmatic, returns JSON)    → createAlert({...})

export async function createAlert(formData: FormData): Promise<void>;
export async function createAlert(input: CreateAlertInput): Promise<CreateAlertResult>;
export async function createAlert(input: FormData | CreateAlertInput): Promise<void | CreateAlertResult> {
  if (input instanceof FormData) {
    return createAlertFromFormData(input);
  }
  return createAlertFromJSON(input);
}

async function createAlertFromFormData(formData: FormData): Promise<void> {
  try {
    await connectToDatabase();
    const session = await auth.api.getSession({ headers: await headers() });
    const user = session?.user;
    if (!user?.id || !user?.email) return;

    const symbol = String(formData.get('symbol') || '').toUpperCase().trim();
    const company = String(formData.get('company') || symbol).trim();
    const alertName = String(formData.get('alertName') || `${symbol} Price Alert`).trim();
    const condition = String(formData.get('condition') || 'greater');
    const thresholdStr = String(formData.get('threshold') || '');
    const threshold = Number(thresholdStr.replace(/[^0-9.\-]/g, ''));
    const alertType: 'upper' | 'lower' = condition === 'less' ? 'lower' : 'upper';

    const parsed = validate(createAlertSchema, { symbol, company, alertName, alertType, threshold });
    if (!parsed.success) {
      logError('Alerts', `Validation failed: ${parsed.error}`);
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
    if (e instanceof Error && e.message.includes('NEXT_REDIRECT')) throw e;
    logError('Alerts', `createAlert formData error: ${e}`);
    redirect('/watchlist');
  }
}

async function createAlertFromJSON(input: CreateAlertInput): Promise<CreateAlertResult> {
  try {
    await connectToDatabase();
    const { userId, userEmail } = await getUserId(input.overrideUserId);
    if (!userId) return { success: false, error: 'Not authenticated' };

    const parsed = validate(createAlertSchema, input);
    if (!parsed.success) return { success: false, error: parsed.error };

    const doc = await PriceAlert.create({
      userId,
      email: userEmail || 'unknown@example.com',
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
    logError('Alerts', `createAlert JSON error: ${e}`);
    return { success: false, error: String(e) };
  }
}

// ─── deleteAlert — dual-path overload ─────────────────────────────────────────
// FormData path (server action, redirects)  → <form action={deleteAlert}>
// JSON path (programmatic, returns JSON)    → deleteAlert(symbol, overrideUserId?)

export async function deleteAlert(formData: FormData): Promise<void>;
export async function deleteAlert(symbol: string, overrideUserId?: string): Promise<DeleteAlertResult>;
export async function deleteAlert(input: FormData | string, overrideUserId?: string): Promise<void | DeleteAlertResult> {
  if (input instanceof FormData) {
    return deleteAlertFromFormData(input);
  }
  return deleteAlertBySymbol(input, overrideUserId);
}

async function deleteAlertFromFormData(formData: FormData): Promise<void> {
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
    if (e instanceof Error && e.message.includes('NEXT_REDIRECT')) throw e;
    logError('Alerts', `deleteAlert formData error: ${e}`);
    redirect('/watchlist');
  }
}

async function deleteAlertBySymbol(symbol: string, overrideUserId?: string): Promise<DeleteAlertResult> {
  try {
    await connectToDatabase();
    const { userId } = await getUserId(overrideUserId);
    if (!userId) return { success: false, error: 'Not authenticated' };

    const result = await PriceAlert.deleteOne({ userId, symbol: symbol.toUpperCase() });
    return { success: true, deletedCount: result.deletedCount };
  } catch (e) {
    logError('Alerts', `deleteAlert symbol error: ${e}`);
    return { success: false, error: String(e) };
  }
}

// ─── getUserAlerts ────────────────────────────────────────────────────────────

export async function getUserAlerts(overrideUserId?: string): Promise<Alert[]> {
  try {
    await connectToDatabase();
    const { userId } = await getUserId(overrideUserId);
    if (!userId) return [];

    const items = await PriceAlert.find({ userId, active: true }).sort({ createdAt: -1 }).lean();
    return (items || []).map((a) => ({
      id: String(a._id),
      symbol: String(a.symbol),
      company: String(a.company),
      alertName: String(a.alertName),
      currentPrice: 0,
      alertType: a.alertType === 'lower' ? 'lower' : 'upper',
      threshold: Number(a.threshold),
    })) as Alert[];
  } catch (e) {
    logError('Alerts', `getUserAlerts error: ${e}`);
    return [];
  }
}

// ─── updateAlertThresholdAction ───────────────────────────────────────────────

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
      logError('Alerts', `Validation failed: ${parsed.error}`);
      redirect('/watchlist');
    }

    await PriceAlert.updateOne(
      { _id: alertId, userId },
      { $set: { threshold: parsed.data.threshold }, $unset: { lastNotifiedOn: '' } }
    );
    revalidatePath('/watchlist');
    redirect('/watchlist');
  } catch (e) {
    if (e instanceof Error && e.message.includes('NEXT_REDIRECT')) throw e;
    logError('Alerts', `updateAlertThresholdAction error: ${e}`);
    redirect('/watchlist');
  }
}
