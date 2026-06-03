// GET /api/jobs/[jobId] — Poll job status, progress, and results
// Returns AIJob document for the given jobId. Used by frontend to poll progress.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import { connectToDatabase } from '@/database/mongoose';
import AIJob from '@/database/models/ai-job.model';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ jobId: string }> },
) {
    try {
        // Auth check
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id;

        const { jobId } = await params;

        if (!jobId) {
            return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
        }

        await connectToDatabase();
        const job = await AIJob.findOne({ jobId }).lean();

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        // Ownership check
        if (job.userId !== userId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Return relevant fields for polling
        return NextResponse.json({
            jobId: job.jobId,
            status: job.status,
            type: job.type,
            title: job.title,
            progress: job.progress,
            currentPhase: job.currentPhase,
            phaseDetail: job.phaseDetail,
            discoveryResults: job.discoveryResults,
            executionTimes: job.executionTimes,
            errorMessage: job.errorMessage,
            createdAt: job.createdAt,
            startedAt: job.startedAt,
            completedAt: job.completedAt,
        });
    } catch (e) {
        console.error('[JobStatus API] Error:', e);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 },
        );
    }
}
