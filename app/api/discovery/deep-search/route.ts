// POST /api/discovery/deep-search — Start a deep discovery job
// Creates an AIJob document, dispatches an Inngest event, returns jobId immediately.
// Uses atomic findOneAndUpdate with upsert to prevent TOCTOU race conditions:
// the partial unique index on { userId: 1, type: 1 } filtered to active statuses
// guarantees only one active discovery job per user at the database level.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import { connectToDatabase } from '@/database/mongoose';
import AIJob from '@/database/models/ai-job.model';
import { inngest } from '@/lib/inngest/client';

export async function POST(request: NextRequest) {
    try {
        // Auth check
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id;

        // Parse and validate body
        const body = await request.json();
        const { symbol, interval, years, seed } = body as {
            symbol?: string;
            interval?: string;
            years?: number;
            seed?: number;
        };

        if (!symbol || typeof symbol !== 'string' || symbol.trim().length === 0) {
            return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
        }

        // SPRINT 3: 1wk kaldırıldı, sadece 4h ve 1d kabul edilir.
        const validIntervals = ['1d', '4h'];
        const safeInterval = validIntervals.includes(interval || '') ? interval! : '1d';

        const safeYears = typeof years === 'number' && years >= 1 && years <= 10 ? years : 2;

        await connectToDatabase();

        // ── Atomic upsert: create or error if active job exists ────────────
        // Instead of read-then-create (which has a TOCTOU window), we use
        // findOneAndUpdate with upsert + the partial unique index guarantees
        // exactly one active discovery job per user.
        const jobId = `deep-disc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        // Try to insert atomically. If an active job already exists for this
        // user+type, the partial unique index will cause a duplicate key error.
        let job;
        try {
            job = await AIJob.create({
                jobId,
                userId,
                type: 'deep_discovery',
                status: 'queued',
                title: `${symbol.toUpperCase()} Deep Discovery`,
                source: 'discovery',
                input: { symbol: symbol.toUpperCase(), interval: safeInterval, years: safeYears, seed },
                progress: 0,
                currentPhase: 0,
                phaseDetail: 'Queued — waiting to start...',
                steps: [
                    { name: 'init', status: 'completed', detail: 'Job created', completedAt: new Date() },
                ],
                seed,
            });
        } catch (err: any) {
            // Duplicate key error (code 11000) from the partial unique index
            if (err?.code === 11000) {
                // Fetch the existing active job to return its jobId
                const existingJob = await AIJob.findOne({
                    userId,
                    type: 'deep_discovery',
                    status: { $in: ['queued', 'running'] },
                }).lean();

                if (existingJob) {
                    console.warn(`[DeepSearch] Active discovery job ${existingJob.jobId} already exists for user ${userId}. Returning existing jobId.`);
                    return NextResponse.json(
                        { jobId: existingJob.jobId, message: 'A discovery job is already running for this account. Please wait for it to complete.' },
                        { status: 409 },
                    );
                }

                // If we couldn't find it (race condition edge case), retry once
                console.warn(`[DeepSearch] Duplicate key but no active job found (race condition). Retrying creation.`);
                job = await AIJob.create({
                    jobId,
                    userId,
                    type: 'deep_discovery',
                    status: 'queued',
                    title: `${symbol.toUpperCase()} Deep Discovery`,
                    source: 'discovery',
                    input: { symbol: symbol.toUpperCase(), interval: safeInterval, years: safeYears, seed },
                    progress: 0,
                    currentPhase: 0,
                    phaseDetail: 'Queued — waiting to start...',
                    steps: [
                        { name: 'init', status: 'completed', detail: 'Job created', completedAt: new Date() },
                    ],
                    seed,
                });
            } else {
                throw err; // Re-throw non-duplicate errors
            }
        }

        // ── Cancel any existing Inngest function for this user ─────────────
        // We send cancellation events for any old running jobs (they may have
        // been created before the partial index was deployed or got stuck).
        // This is best-effort — the index prevents new duplicates going forward.
        try {
            const staleJobs = await AIJob.find({
                userId,
                type: 'deep_discovery',
                status: { $in: ['queued', 'running'] },
                jobId: { $ne: jobId }, // Exclude the job we just created
            }).lean();

            for (const oldJob of staleJobs) {
                try {
                    await inngest.send({
                        name: 'discovery/deep-search.cancelled',
                        data: { jobId: oldJob.jobId },
                    });
                } catch (cancelError) {
                    console.warn(`[DeepSearch] Failed to cancel stale job ${oldJob.jobId}:`, cancelError);
                }

                await AIJob.updateOne(
                    { _id: oldJob._id },
                    { $set: { status: 'cancelled', errorMessage: 'Superseded by a new discovery request.' } },
                );
            }
        } catch (staleError) {
            console.warn(`[DeepSearch] Error cleaning up stale jobs:`, staleError);
        }

        // Dispatch Inngest event
        await inngest.send({
            name: 'discovery/deep-search.started',
            data: {
                jobId,
                symbol: symbol.toUpperCase(),
                interval: safeInterval,
                years: safeYears,
                userId,
                seed,
            },
        });

        return NextResponse.json({ jobId }, { status: 200 });
    } catch (e) {
        console.error('[DeepSearch API] Error:', e);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 },
        );
    }
}
