'use server';

import { connectToDatabase } from '@/database/mongoose';
import Notification from '@/database/models/notification.model';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';

async function getUserId(): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function getUserNotifications(limit: number = 20) {
  try {
    const userId = await getUserId();
    if (!userId) return { success: false, error: 'Unauthorized' };

    await connectToDatabase();
    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return { 
      success: true, 
      notifications: JSON.parse(JSON.stringify(notifications)) 
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function markNotificationAsRead(notificationId: string) {
  try {
    const userId = await getUserId();
    if (!userId) return { success: false, error: 'Unauthorized' };

    await connectToDatabase();
    await Notification.updateOne(
      { _id: notificationId, userId },
      { $set: { status: 'read', readAt: new Date() } }
    );

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function markAllNotificationsAsRead() {
  try {
    const userId = await getUserId();
    if (!userId) return { success: false, error: 'Unauthorized' };

    await connectToDatabase();
    await Notification.updateMany(
      { userId, status: 'unread' },
      { $set: { status: 'read', readAt: new Date() } }
    );

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
