'use server';

import { connectToDatabase } from '@/database/mongoose';
import AIJob from '@/database/models/ai-job.model';
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

export async function getActiveJobs() {
  try {
    const userId = await getUserId();
    if (!userId) return { success: false, error: 'Unauthorized' };

    await connectToDatabase();
    // Get all running or queued jobs
    const activeJobs = await AIJob.find({ 
      userId,
      status: { $in: ['running', 'queued'] }
    })
      .sort({ createdAt: -1 })
      .lean();

    return { 
      success: true, 
      activeJobs: JSON.parse(JSON.stringify(activeJobs)) 
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function getAllJobs() {
  try {
    const userId = await getUserId();
    if (!userId) return { success: false, error: 'Unauthorized' };

    await connectToDatabase();
    const jobs = await AIJob.find({ userId })
      .sort({ createdAt: -1 })
      .lean();

    return { 
      success: true, 
      jobs: JSON.parse(JSON.stringify(jobs)) 
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function deleteJob(id: string) {
  try {
    const userId = await getUserId();
    if (!userId) return { success: false, error: 'Unauthorized' };

    await connectToDatabase();
    await AIJob.deleteOne({ _id: id, userId });

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
