'use server';

import { connectToDatabase } from '@/database/mongoose';
import AIJob from '@/database/models/ai-job.model';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import { inngest } from '@/lib/inngest/client';

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

export async function getJobByJobId(jobId: string) {
  try {
    const userId = await getUserId();
    if (!userId) return { success: false, error: 'Unauthorized' };

    await connectToDatabase();
    const job = await AIJob.findOne({ jobId, userId }).lean();
    if (!job) return { success: false, error: 'Job not found' };

    // Auto-fail jobs that have been stuck in running state for more than 5 minutes (e.g. if the server crashed)
    if ((job.status === 'running' || job.status === 'queued') && job.createdAt) {
      const ageMs = Date.now() - new Date(job.createdAt).getTime();
      if (ageMs > 5 * 60 * 1000) {
        await AIJob.updateOne(
          { _id: job._id },
          { $set: { status: 'failed', errorMessage: 'Job timed out due to server restart.' } }
        );
        job.status = 'failed';
        job.errorMessage = 'Job timed out due to server restart.';
      }
    }

    return { success: true, job: JSON.parse(JSON.stringify(job)) };
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

    // Find the job first to get its jobId and type for Inngest cancellation
    const job = await AIJob.findOne({ _id: id, userId }).lean();
    if (!job) return { success: false, error: 'Job not found' };

    // Cancel the associated Inngest function if it's a deep_discovery job.
    // This prevents Inngest's concurrency limit from blocking new discoveries
    // when the old function is still running but the DB record was deleted.
    // The cancelOn config in discovery-deep-search.ts listens for this event.
    if ((job.type === 'deep_discovery' || job.status === 'running' || job.status === 'queued') && job.jobId) {
      try {
        await inngest.send({
          name: 'discovery/deep-search.cancelled',
          data: { jobId: job.jobId },
        });
      } catch (cancelError) {
        console.warn(`[deleteJob] Failed to send cancel event for job ${job.jobId}:`, cancelError);
      }
    }

    await AIJob.deleteOne({ _id: id, userId });

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
