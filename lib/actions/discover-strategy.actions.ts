'use server';

import { connectToDatabase } from '@/database/mongoose';
import AIJob from '@/database/models/ai-job.model';
import { inngest } from '@/lib/inngest/client';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';

/**
 * Result returned by discoverStrategyAction after dispatching the Inngest job.
 */
export interface DiscoveryDispatchResult {
    success: boolean;
    /** Inngest job ID for polling progress */
    jobId?: string;
    /** Error message if dispatch failed */
    error?: string;
    /** HTTP-style status code for client handling (e.g. 409 for duplicate) */
    status?: number;
}

/**
 * Server action: Dispatch a Deep Discovery job to Inngest.
 *
 * This is a NON-BLOCKING dispatcher — it creates the AIJob record and sends
 * the Inngest event, then returns immediately with a jobId. The heavy MCTS +
 * Hyperband + DE pipeline runs asynchronously inside the Inngest worker
 * (lib/inngest/discovery-deep-search.ts), keeping the Next.js main thread
 * and client UI fully responsive.
 *
 * Progress can be polled via GET /api/jobs/[jobId] or watched with the
 * DeepDiscoveryProgress component.
 */
export async function discoverStrategyAction(
    options: {
        symbol: string;
        interval?: string;
        years?: number;
        mode?: string;
        topN?: number;
        seed?: number;
    }
): Promise<DiscoveryDispatchResult> {
    // ── Auth ────────────────────────────────────────────────────────
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) {
        return { success: false, error: 'Unauthorized', status: 401 };
    }

    const { symbol, interval, years, seed } = options;

    if (!symbol || typeof symbol !== 'string' || symbol.trim().length === 0) {
        return { success: false, error: 'Symbol is required', status: 400 };
    }

    const safeInterval = (['1d', '4h'].includes(interval ?? '') ? interval! : '1d');
    const safeYears = typeof years === 'number' && years >= 1 && years <= 10 ? years : 2;

    const jobId = `deep-disc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
        await connectToDatabase();

        // ── Atomic job creation (partial unique index prevents duplicates) ──
        try {
            await AIJob.create({
                jobId,
                userId,
                type: 'deep_discovery',
                status: 'queued',
                title: `${symbol.toUpperCase()} Deep Discovery`,
                source: 'discovery',
                input: {
                    symbol: symbol.toUpperCase(),
                    interval: safeInterval,
                    years: safeYears,
                    seed,
                },
                progress: 0,
                currentPhase: 0,
                phaseDetail: 'Queued — waiting to start...',
                steps: [
                    { name: 'init', status: 'completed', detail: 'Job created via Server Action', completedAt: new Date() },
                ],
                seed,
            });
        } catch (err: any) {
            if (err?.code === 11000) {
                // Duplicate: an active job already exists for this user
                const existingJob = await AIJob.findOne({
                    userId,
                    type: 'deep_discovery',
                    status: { $in: ['queued', 'running'] },
                }).lean();

                if (existingJob) {
                    return {
                        success: true,
                        jobId: existingJob.jobId as string,
                        error: 'A discovery job is already running for this account.',
                        status: 409,
                    };
                }

                // Race condition edge case — retry once and catch any errors
                try {
                    await AIJob.create({
                        jobId,
                        userId,
                        type: 'deep_discovery',
                        status: 'queued',
                        title: `${symbol.toUpperCase()} Deep Discovery`,
                        source: 'discovery',
                        input: {
                            symbol: symbol.toUpperCase(),
                            interval: safeInterval,
                            years: safeYears,
                            seed,
                        },
                        progress: 0,
                        currentPhase: 0,
                        phaseDetail: 'Queued — waiting to start...',
                        steps: [
                            { name: 'init', status: 'completed', detail: 'Job created via Server Action', completedAt: new Date() },
                        ],
                        seed,
                    });
                } catch (retryErr) {
                    console.error('[discoverStrategyAction] Retry create failed:', retryErr);
                    return {
                        success: false,
                        error: 'A discovery job conflicts or failed to initialize. Please try again.',
                        status: 409,
                    };
                }
            } else {
                throw err;
            }
        }

        // ── Cancel stale jobs for this user ─────────────────────────
        try {
            const staleJobs = await AIJob.find({
                userId,
                type: 'deep_discovery',
                status: { $in: ['queued', 'running'] },
                jobId: { $ne: jobId },
            }).lean();

            for (const oldJob of staleJobs) {
                await inngest.send({
                    name: 'discovery/deep-search.cancelled',
                    data: { jobId: oldJob.jobId },
                });
                await AIJob.updateOne(
                    { _id: oldJob._id },
                    { $set: { status: 'cancelled', errorMessage: 'Superseded by a new discovery request.' } },
                );
            }
        } catch (staleError) {
            console.warn('[discoverStrategyAction] Stale job cleanup failed:', staleError);
        }

        // ── Dispatch Inngest event (Awaited to fail gracefully if offline) ──
        try {
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
        } catch (sendError) {
            console.error('[discoverStrategyAction] Inngest send failed:', sendError);
            // Mark job as failed in DB so it doesn't stay queued forever
            await AIJob.updateOne(
                { jobId },
                { $set: { status: 'failed', errorMessage: 'Inngest event dispatcher is offline. Job could not be started.' } }
            );
            return {
                success: false,
                error: 'Failed to dispatch job to background worker. Please try again.',
                status: 503,
            };
        }

        revalidatePath('/ta');

        return { success: true, jobId };
    } catch (e) {
        console.error('[discoverStrategyAction] Dispatch failed:', e);
        return {
            success: false,
            error: e instanceof Error ? e.message : 'Failed to start discovery job',
            status: 500,
        };
    }
}
