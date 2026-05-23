'use server';

import { connectToDatabase } from '@/database/mongoose';
import { Report } from '@/database/models/report.model';
import AIJob from '@/database/models/ai-job.model';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';

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
