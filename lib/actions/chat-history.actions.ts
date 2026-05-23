'use server';

import { connectToDatabase } from '@/database/mongoose';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import { Conversation } from '@/database/models/conversation.model';
import { Message } from '@/database/models/message.model';
import mongoose from 'mongoose';

async function getSessionUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id ?? null;
}

export async function createConversation(title: string): Promise<{ success: boolean; conversationId?: string; error?: string }> {
  try {
    const userId = await getSessionUserId();
    if (!userId) return { success: false, error: 'Not authenticated' };

    await connectToDatabase();
    const conv = await Conversation.create({
      userId,
      title: title.slice(0, 100),
    });

    return { success: true, conversationId: String(conv._id) };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function getUserConversations(): Promise<{ success: boolean; conversations?: { id: string; title: string; updatedAt: string }[]; error?: string }> {
  try {
    const userId = await getSessionUserId();
    if (!userId) return { success: false, error: 'Not authenticated' };

    await connectToDatabase();
    const conversations = await Conversation.find({ userId })
      .sort({ updatedAt: -1 })
      .select('title isPinned updatedAt')
      .limit(50)
      .lean();

    return {
      success: true,
      conversations: conversations.map((c) => ({
        id: String(c._id),
        title: c.title,
        isPinned: (c as any).isPinned ?? false,
        updatedAt: c.updatedAt.toISOString(),
      })),
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function getConversationMessages(conversationId: string): Promise<{ success: boolean; messages?: { role: string; parts: Record<string, unknown>[] }[]; error?: string }> {
  try {
    const userId = await getSessionUserId();
    if (!userId) return { success: false, error: 'Not authenticated' };

    await connectToDatabase();
    const messages = await Message.find({
      conversationId: new mongoose.Types.ObjectId(conversationId),
      userId,
    })
      .sort({ createdAt: 1 })
      .select('role parts')
      .lean();

    return {
      success: true,
      messages: messages.map((m) => ({
        role: m.role,
        parts: m.parts as Record<string, unknown>[],
      })),
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function saveMessage(
  conversationId: string,
  role: 'user' | 'assistant' | 'system' | 'tool',
  parts: Record<string, unknown>[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await getSessionUserId();
    if (!userId) return { success: false, error: 'Not authenticated' };

    await connectToDatabase();
    await Message.create({
      conversationId: new mongoose.Types.ObjectId(conversationId),
      userId,
      role,
      parts,
    });

    // Update conversation's updatedAt
    await Conversation.updateOne(
      { _id: new mongoose.Types.ObjectId(conversationId), userId },
      { $set: { updatedAt: new Date() } }
    );

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function deleteConversation(conversationId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await getSessionUserId();
    if (!userId) return { success: false, error: 'Not authenticated' };

    await connectToDatabase();
    await Message.deleteMany({ conversationId: new mongoose.Types.ObjectId(conversationId), userId });
    await Conversation.deleteOne({ _id: new mongoose.Types.ObjectId(conversationId), userId });

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function updateConversationTitle(conversationId: string, title: string): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await getSessionUserId();
    if (!userId) return { success: false, error: 'Not authenticated' };

    await connectToDatabase();
    await Conversation.updateOne(
      { _id: new mongoose.Types.ObjectId(conversationId), userId },
      { $set: { title: title.slice(0, 100), updatedAt: new Date() } }
    );

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function togglePinConversation(conversationId: string): Promise<{ success: boolean; isPinned?: boolean; error?: string }> {
  try {
    const userId = await getSessionUserId();
    if (!userId) return { success: false, error: 'Not authenticated' };
    await connectToDatabase();
    const conv = await Conversation.findOne({ _id: new mongoose.Types.ObjectId(conversationId), userId });
    if (!conv) return { success: false, error: 'Not found' };
    const newPinned = !conv.isPinned;
    await Conversation.updateOne(
      { _id: new mongoose.Types.ObjectId(conversationId), userId },
      { $set: { isPinned: newPinned, updatedAt: new Date() } }
    );
    return { success: true, isPinned: newPinned };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
