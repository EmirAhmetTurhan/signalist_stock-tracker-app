'use server';

import { connectToDatabase } from '@/database/mongoose';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import { AnalysisNote } from '@/database/models/analysis-note.model';
import mongoose from 'mongoose';

async function getSessionUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id ?? null;
}

export async function saveAnalysisNote(data: {
  title: string;
  symbol?: string;
  content: string;
  tags?: string[];
  conversationId?: string;
}): Promise<{ success: boolean; noteId?: string; error?: string }> {
  try {
    const userId = await getSessionUserId();
    if (!userId) return { success: false, error: 'Not authenticated' };

    await connectToDatabase();
    const note = await AnalysisNote.create({
      userId,
      title: data.title.slice(0, 200),
      symbol: data.symbol?.toUpperCase(),
      content: data.content.slice(0, 50000),
      tags: data.tags || [],
      conversationId: data.conversationId ? new mongoose.Types.ObjectId(data.conversationId) : undefined,
    });

    return { success: true, noteId: String(note._id) };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function getUserNotes(symbol?: string): Promise<{
  success: boolean;
  notes?: { id: string; title: string; symbol?: string; tags: string[]; createdAt: string; contentSnippet: string }[];
  error?: string;
}> {
  try {
    const userId = await getSessionUserId();
    if (!userId) return { success: false, error: 'Not authenticated' };

    await connectToDatabase();
    const filter: Record<string, unknown> = { userId };
    if (symbol) filter.symbol = symbol.toUpperCase();

    const notes = await AnalysisNote.find(filter).sort({ createdAt: -1 }).lean();

    return {
      success: true,
      notes: notes.map((n) => ({
        id: String(n._id),
        title: n.title,
        symbol: n.symbol,
        tags: n.tags || [],
        createdAt: n.createdAt.toISOString(),
        contentSnippet: (n.content || '').slice(0, 200),
      })),
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function getNoteById(noteId: string): Promise<{
  success: boolean;
  note?: { id: string; title: string; symbol?: string; content: string; tags: string[]; createdAt: string };
  error?: string;
}> {
  try {
    const userId = await getSessionUserId();
    if (!userId) return { success: false, error: 'Not authenticated' };

    await connectToDatabase();
    const note = await AnalysisNote.findOne({ _id: new mongoose.Types.ObjectId(noteId), userId }).lean();

    if (!note) return { success: false, error: 'Note not found' };

    return {
      success: true,
      note: {
        id: String(note._id),
        title: note.title,
        symbol: note.symbol,
        content: note.content,
        tags: note.tags || [],
        createdAt: note.createdAt.toISOString(),
      },
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function deleteNote(noteId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await getSessionUserId();
    if (!userId) return { success: false, error: 'Not authenticated' };

    await connectToDatabase();
    await AnalysisNote.deleteOne({ _id: new mongoose.Types.ObjectId(noteId), userId });

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function searchNotes(query: string): Promise<{
  success: boolean;
  notes?: { id: string; title: string; symbol?: string; tags: string[]; createdAt: string; contentSnippet: string }[];
  error?: string;
}> {
  try {
    const userId = await getSessionUserId();
    if (!userId) return { success: false, error: 'Not authenticated' };

    await connectToDatabase();
    const notes = await AnalysisNote.find({
      userId,
      $or: [
        { title: { $regex: query, $options: 'i' } },
        { content: { $regex: query, $options: 'i' } },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return {
      success: true,
      notes: notes.map((n) => ({
        id: String(n._id),
        title: n.title,
        symbol: n.symbol,
        tags: n.tags || [],
        createdAt: n.createdAt.toISOString(),
        contentSnippet: (n.content || '').slice(0, 200),
      })),
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
