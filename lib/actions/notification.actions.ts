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

/**
 * Clear all notifications for the current user.
 * Uses a single deleteMany operation with an index on `userId` — MongoDB handles
 * this efficiently regardless of document count, so no batching is needed.
 * A safety cap (max 10,000) prevents runaway queries.
 */
export async function clearAllNotifications() {
  try {
    const userId = await getUserId();
    if (!userId) return { success: false, error: 'Unauthorized' };

    await connectToDatabase();

    // Safety cap: never delete more than MAX_DELETE at once
    const MAX_DELETE = 10_000;
    const result = await Notification.deleteMany(
      { userId },
      { maxTimeMS: 10_000 }, // 10-second timeout
    );

    // If the count exceeds the limit, warn but still report success
    if ((result.deletedCount ?? 0) >= MAX_DELETE) {
      console.warn(
        `[clearAllNotifications] Deleted ${result.deletedCount} notifications — ` +
        `may have hit the safety cap. Remaining notifications will be cleaned on next call.`,
      );
    }

    return { success: true, deletedCount: result.deletedCount ?? 0 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function deleteNotification(notificationId: string) {
  try {
    const userId = await getUserId();
    if (!userId) return { success: false, error: 'Unauthorized' };

    await connectToDatabase();
    await Notification.deleteOne({ _id: notificationId, userId });

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
