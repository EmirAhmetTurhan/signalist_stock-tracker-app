'use server';

import { connectToDatabase } from '@/database/mongoose';
import { Report } from '@/database/models/report.model';
import AIJob from '@/database/models/ai-job.model';
import Notification from '@/database/models/notification.model';
import SavedStrategy from '@/database/models/saved-strategy.model';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import { inngest } from '@/lib/inngest/client';

export async function getReportByJobId(jobId: string): Promise<{
  success: boolean;
  report?: {
    jobId: string;
    symbol: string;
    indicator: string;
    status: 'processing' | 'completed' | 'failed';
    errorMessage: string | null;
    steps?: Array<{ name: string; status: string; detail?: string; completedAt?: string }>;
    bestValue: number | null;
    winRate: number | null;
    fullData: Record<string, unknown> | null;
    createdAt: string;
  };
  error?: string;
}> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return { success: false, error: 'Unauthorized' };

    await connectToDatabase();

    // First, look for the AIJob
    const job = await AIJob.findOne({ jobId, userId }).lean();
    if (!job) {
      // Fallback to Report for older jobs that didn't have AIJob
      const oldReport = await Report.findOne({ jobId, userId }).lean();
      if (!oldReport) return { success: false, error: 'Report not found' };

      return {
        success: true,
        report: {
          jobId: oldReport.jobId,
          symbol: oldReport.symbol,
          indicator: oldReport.indicator,
          status: oldReport.status as any,
          errorMessage: oldReport.errorMessage,
          steps: oldReport.steps as any[] | undefined,
          bestValue: oldReport.bestValue,
          winRate: oldReport.winRate,
          fullData: oldReport.fullData as Record<string, unknown> | null,
          createdAt: oldReport.createdAt.toISOString(),
        },
      };
    }

    // If we have an AIJob, check if it's completed and has a report
    let bestValue = null;
    let winRate = null;
    let fullData = null;

    // Auto-fail jobs stuck for > 5 mins
    if ((job.status === 'running' || job.status === 'queued') && job.createdAt) {
      const ageMs = Date.now() - new Date(job.createdAt).getTime();
      if (ageMs > 5 * 60 * 1000) {
        await AIJob.updateOne({ _id: job._id }, { $set: { status: 'failed', errorMessage: 'Job timed out due to server restart.' } });
        job.status = 'failed';
        job.errorMessage = 'Job timed out due to server restart.';
      }
    }

    if (job.status === 'completed' && job.reportId) {
      const report = await Report.findById(job.reportId).lean();
      if (report) {
        bestValue = report.bestValue;
        winRate = report.winRate;
        fullData = report.fullData as Record<string, unknown> | null;
      }
    }

    const input = (job.input as Record<string, any>) || {};

    return {
      success: true,
      report: {
        jobId: jobId,
        symbol: input.symbol || 'UNKNOWN',
        indicator: input.indicator || 'UNKNOWN',
        status: job.status === 'running' || job.status === 'queued' ? 'processing' : job.status as any,
        errorMessage: job.errorMessage || null,
        steps: job.steps as any[] | undefined,
        bestValue,
        winRate,
        fullData,
        createdAt: (job.createdAt || new Date()).toISOString(),
      },
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}


export async function getAllReports() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return { success: false, error: 'Unauthorized' };

    await connectToDatabase();

    const reports = await Report.find({ userId })
      .sort({ createdAt: -1 })
      .lean();

    return {
      success: true,
      reports: JSON.parse(JSON.stringify(reports))
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function getReportById(id: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return { success: false, error: 'Unauthorized' };

    await connectToDatabase();
    const report = await Report.findOne({ _id: id, userId }).lean();

    if (!report) return { success: false, error: 'Report not found' };

    return {
      success: true,
      report: JSON.parse(JSON.stringify(report))
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ─── Re-Optimize a previously completed discovery report ────────────────────────────

export async function reoptimizeStrategy(reportId: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return { success: false, error: 'Unauthorized' };

    await connectToDatabase();

    // Find the original report
    const report = await Report.findOne({ _id: reportId, userId }).lean();
    if (!report) return { success: false, error: 'Report not found' };
    if (report.type !== 'discovery') {
      return { success: false, error: 'Only discovery reports can be re-optimized' };
    }

    const config = report.discoveryConfig as
      | { symbol?: string; interval?: string; years?: number }
      | undefined;
    if (!config?.symbol) {
      return { success: false, error: 'Invalid discovery configuration — missing symbol' };
    }

    const symbol = config.symbol;
    const interval = config.interval || '1d';
    const years = config.years || 2;

    // Generate new job ID
    const jobId = `deep-disc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Create AIJob with rerunOfArtifactId linking back to the original report
    await AIJob.create({
      jobId,
      userId,
      type: 'deep_discovery',
      status: 'queued',
      title: `${symbol.toUpperCase()} Deep Discovery (Re-Optimize)`,
      source: 'discovery',
      input: { symbol: symbol.toUpperCase(), interval, years },
      progress: 0,
      currentPhase: 0,
      phaseDetail: 'Queued — waiting to start...',
      steps: [
        {
          name: 'init',
          status: 'completed',
          detail: 'Re-optimization job created',
          completedAt: new Date(),
        },
      ],
    });

    // Dispatch Inngest event with rerunOfArtifactId
    await inngest.send({
      name: 'discovery/deep-search.started',
      data: {
        jobId,
        symbol: symbol.toUpperCase(),
        interval,
        years,
        userId,
        rerunOfArtifactId: reportId,
      },
    });

    return { success: true, jobId };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Delete a report and cascade-delete all associated notifications.
 *
 * This ensures that when a report is removed from the Archive, its
 * corresponding notification entries in the notification center are
 * also cleaned up, preventing orphaned ("yetim") notifications.
 */
export async function deleteReport(reportId: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return { success: false, error: 'Unauthorized' };

    await connectToDatabase();

    // 1. Find the report to verify ownership
    const report = await Report.findOne({ _id: reportId, userId }).lean();
    if (!report) return { success: false, error: 'Report not found' };

    // 2. Delete the report
    await Report.deleteOne({ _id: reportId, userId });

    // 3. Cascade delete: remove any notifications referencing this report
    const notifResult = await Notification.deleteMany({
      userId,
      reportId: reportId,
    });

    // 4. Also clean up linked AIJob records
    if (report.jobId) {
      await AIJob.deleteOne({ jobId: report.jobId, userId });
    }

    // 5. Cascade delete: remove saved strategies linked to this report (discovery reports)
    const strategyResult = await SavedStrategy.deleteMany({
      userId,
      sourceReportId: reportId,
    });

    return {
      success: true,
      deletedNotifications: notifResult.deletedCount ?? 0,
      deletedStrategies: strategyResult.deletedCount ?? 0,
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function clearReportsByType(type: 'discovery' | 'analysis') {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return { success: false, error: 'Unauthorized' };

    await connectToDatabase();

    const query = type === 'discovery' ? { type: 'discovery' } : { type: { $ne: 'discovery' } };
    
    // Find reports to get their IDs for cascade deletion
    const reports = await Report.find({ userId, ...query }).lean();
    if (reports.length === 0) return { success: true, deletedCount: 0 };
    
    const reportIds = reports.map(r => r._id);
    const jobIds = reports.map(r => r.jobId).filter(Boolean);

    // Delete reports
    const reportResult = await Report.deleteMany({ userId, _id: { $in: reportIds } });

    // Cascade delete notifications
    await Notification.deleteMany({ userId, reportId: { $in: reportIds } });

    // Clean up linked AIJob records
    if (jobIds.length > 0) {
      await AIJob.deleteMany({ userId, jobId: { $in: jobIds } });
    }

    // Cascade delete saved strategies if discovery
    if (type === 'discovery') {
      await SavedStrategy.deleteMany({ userId, sourceReportId: { $in: reportIds } });
    }

    return { success: true, deletedCount: reportResult.deletedCount ?? 0 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
