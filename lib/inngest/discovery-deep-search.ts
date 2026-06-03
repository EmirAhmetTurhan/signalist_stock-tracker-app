// lib/inngest/discovery-deep-search.ts — Deep Discovery Inngest Job (v3)
// Pipeline: MI Filter → MCTS Search → Hyperband Bracket 1 (25%) → Bracket 2 (50%)
//   → Bracket 3 + DE (100%) → Strategy Portfolio → Save Report
//
// Each heavy computation runs in its own step.run() block with MongoDB checkpoint
// persistence between steps, preventing Inngest timeouts and allowing resumption.
// Only lightweight metadata (combos, scores, params) is passed between steps.
// The full candle/indicator data is loaded once in Phase 1 and referenced by all
// subsequent steps via closure — NOT re-passed between steps.

import { inngest } from '@/lib/inngest/client';
import { connectToDatabase } from '@/database/mongoose';
import AIJob from '@/database/models/ai-job.model';
import Notification from '@/database/models/notification.model';
import { Report } from '@/database/models/report.model';
import type { DiscoveryStrategyResult } from '@/database/models/report.model';
import type { Candle } from '@/lib/ta/backtest';
// SPRINT 3: 1wk kaldırıldı, timeframe-limits.ts dosyası silindi.
// 4h ve 1d tek desteklenen timeframe'ler olduğu için clamp mantığı inline yapıldı.
import { getCandlesForInterval } from '@/lib/actions/finnhub.actions';
import { computeIndicators } from '@/lib/ta/compute';
import { DEFAULT_PARAMS } from '@/lib/constants/indicators';
import { mapComputedToAllData } from '@/lib/ta/strategy-optimizer';
import type { AllData, DiscoveredStrategy } from '@/lib/ta/strategy-optimizer';
import type { SignalProfile } from '@/lib/ta/types';
import { DISCOVERY_POOL } from '@/lib/ta/indicator-registry';
import {
    executeBracket,
    promoteCombos,
    MASK_DENSITIES,
    ETA,
} from '@/lib/ta/hyperband-search';
import type { HyperbandBracketResult } from '@/lib/ta/hyperband-search';
import { computeMIPriorWeights } from '@/lib/ta/mutual-information';
import { mctsSearch } from '@/lib/ta/mcts-search';
import { buildPortfolio } from '@/lib/ta/strategy-portfolio';
import type { StrategyPortfolio } from '@/lib/ta/strategy-portfolio';
import { PHASE_NAMES } from '@/lib/ta/discovery-types';

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Target portfolio size (3-5 low-correlation strategies). */
const PORTFOLIO_TARGET_SIZE = 5;

/** Max portfolio build attempts before falling back to smaller set. */
const MAX_PORTFOLIO_BUILD_ATTEMPTS = 3;

/** Maximum MCTS iterations. */
const DEFAULT_MCTS_ITERATIONS = 200;

/** MCTS max nodes. */
const DEFAULT_MCTS_MAX_NODES = 500;

/** MCTS max combo depth (number of indicators per strategy). */
const DEFAULT_MCTS_MAX_DEPTH = 5;

/** Default look-forward bars. */
const DEFAULT_LOOK_FORWARD = 14;

/** Max candles to use for Hyperband evaluation. */
const DEFAULT_MAX_CANDLES = 500;

// ─── Helper: Update job progress in DB ──────────────────────────────────────────

async function updateJobProgress(
    jobId: string,
    phase: number,
    current: number,
    total: number,
    detail: string,
) {
    try {
        await connectToDatabase();
        const progress = total > 0 ? Math.round((current / total) * 100) : 0;
        await AIJob.updateOne(
            { jobId },
            {
                $set: {
                    currentPhase: phase,
                    progress,
                    phaseDetail: detail,
                    status: 'running',
                },
            },
        );
    } catch (e) {
        console.error(`[DeepDiscovery] Failed to update progress for ${jobId}:`, e);
    }
}

// ─── Helper: Map HyperbandBracketResult[] to DiscoveredStrategy[] ───────────────

function bracketToDiscoveredStrategy(
    bracketResults: HyperbandBracketResult[],
): DiscoveredStrategy[] {
    return bracketResults.map((br) => {
        const fr = br.fullResult;
        return {
            indicators: br.combo,
            params: br.bestParams,
            winRate: fr.winRate,
            totalSignals: fr.totalSignals,
            rank: 0, // set later
            profitFactor: fr.profitFactor,
            sharpeRatio: fr.sharpeRatio,
            avgWin: fr.avgWin,
            avgLoss: fr.avgLoss,
            maxDrawdown: fr.maxDrawdown,
            totalReturn: fr.totalReturn,
            regimeBreakdown: fr.regimeBreakdown as any,
            compositeScore: br.compositeScore,
        };
    });
}

// ─── Helper: Serialize HyperbandBracketResult for MongoDB storage ───────────────
// Keeps payloads lightweight — strips fullResult arrays, keeps only metrics.

interface BracketCheckpointEntry {
    combo: string[];
    bestParams: Record<string, number>;
    compositeScore: number;
    bracketLevel: number;
    survived: boolean;
    // Compact metrics (no raw arrays)
    winRate: number;
    totalSignals: number;
    sharpeRatio: number;
    profitFactor: number;
    avgWin: number;
    avgLoss: number;
    maxDrawdown: number;
    totalReturn: number;
}

function bracketToCheckpoint(br: HyperbandBracketResult): BracketCheckpointEntry {
    return {
        combo: br.combo,
        bestParams: br.bestParams,
        compositeScore: br.compositeScore,
        bracketLevel: br.bracketLevel,
        survived: br.survived,
        winRate: br.fullResult.winRate,
        totalSignals: br.fullResult.totalSignals,
        sharpeRatio: br.fullResult.sharpeRatio ?? 0,
        profitFactor: br.fullResult.profitFactor ?? 0,
        avgWin: br.fullResult.avgWin ?? 0,
        avgLoss: br.fullResult.avgLoss ?? 0,
        maxDrawdown: br.fullResult.maxDrawdown ?? 0,
        totalReturn: br.fullResult.totalReturn ?? 0,
    };
}

function checkpointToBracket(entry: BracketCheckpointEntry): HyperbandBracketResult {
    return {
        combo: entry.combo,
        bestParams: entry.bestParams,
        compositeScore: entry.compositeScore,
        bracketLevel: entry.bracketLevel,
        survived: entry.survived,
        fullResult: {
            winRate: entry.winRate,
            totalSignals: entry.totalSignals,
            sharpeRatio: entry.sharpeRatio,
            profitFactor: entry.profitFactor,
            avgWin: entry.avgWin,
            avgLoss: entry.avgLoss,
            maxDrawdown: entry.maxDrawdown,
            totalReturn: entry.totalReturn,
        } as any,
    };
}

// ─── Inngest Function ───────────────────────────────────────────────────────────

export const deepDiscoveryJob = inngest.createFunction(
    {
        id: 'discovery-deep-search',
        retries: 1,
        concurrency: [{ limit: 1, key: 'event.data.userId' }],
        cancelOn: [
            {
                event: 'discovery/deep-search.cancelled',
                if: 'event.data.jobId == async.data.jobId',
            },
        ],
        triggers: [{ event: 'discovery/deep-search.started' }],
    },
    async ({ event, step }) => {
        const { jobId, symbol, interval, years, userId, seed, rerunOfArtifactId, signalProfile } = event.data as {
            jobId: string;
            symbol: string;
            interval: string;
            years: number;
            userId: string;
            seed?: number;
            rerunOfArtifactId?: string;
            signalProfile?: SignalProfile;
        };

        // ── Timeframe Isolation Guard ──────────────────────────────
        const { assertAllowedTimeframe } = await import('@/lib/ta/timeframe-guard');
        const safeInterval = assertAllowedTimeframe(interval, 'discovery-deep-search');

        const executionTimes: Record<string, number> = {};

        try {
            // ═══════════════════════════════════════════════════════════
            // Phase 1: Data Preparation
            // ═══════════════════════════════════════════════════════════
            const phase1Data = await step.run('phase-1-data-prep', async () => {
                const start = Date.now();
                await updateJobProgress(jobId, 1, 0, 1, 'Fetching candle data...');

                // SPRINT 3: 1wk kaldırıldı. 4h ve 1d tek desteklenen timeframe'ler
                // olduğu için clamp mantığı inline yapıldı. 10 yıl = 3650 gün cap.
                const days = Math.min(years * 365, 3650);
                const candles: Candle[] = await getCandlesForInterval(symbol, safeInterval, days);

                if (!candles || candles.length < 100) {
                    throw new Error(
                        `Insufficient data: ${symbol} returned ${candles?.length ?? 0} candles (need ≥100)`,
                    );
                }

                await updateJobProgress(
                    jobId, 1, 1, 2,
                    `Computing ${DISCOVERY_POOL.length} indicators...`,
                );

                // Compute ALL indicators with default params
                const allIndicators = new Set(DISCOVERY_POOL.map((s) => s.toLowerCase()));
                const computed = computeIndicators(candles as any, allIndicators, DEFAULT_PARAMS);
                const allData = mapComputedToAllData(computed);

                executionTimes.phase1 = Date.now() - start;
                await updateJobProgress(
                    jobId, 1, 2, 2,
                    `Data ready: ${candles.length} candles, ${DISCOVERY_POOL.length} indicators`,
                );

                // Return candles + allData — serialized once, referenced by all steps via closure
                return { candles, allData, symbol, safeInterval, days };
            });

            // ═══════════════════════════════════════════════════════════
            // Phase 2a: MI Filter → MCTS Search
            // MI computes indicator prior weights → MCTS explores combos with UCT
            // Returns: prior weights + MCTS top combos (just indices, no candle data)
            // Checkpoint: saves to MongoDB for potential resume
            // ═══════════════════════════════════════════════════════════
            const phase2aResult = await step.run('phase-2a-mi-mcts', async () => {
                const start = Date.now();
                await updateJobProgress(jobId, 2, 0, 1, 'Computing MI prior weights...');

                const { candles, allData } = phase1Data;
                const lookForward = DEFAULT_LOOK_FORWARD;

                // Trim candles to max resource
                const evalCandles = candles.length > DEFAULT_MAX_CANDLES
                    ? candles.slice(candles.length - DEFAULT_MAX_CANDLES)
                    : candles;

                // ── Step 2a.1: MI Prior Weights ──
                const miResult = computeMIPriorWeights(evalCandles, allData, { lookForward });
                const priorWeights = miResult.priorWeights;

                // Serialize Float64Array → Record<string, number> for MongoDB
                const priorWeightsObj: Record<string, number> = {};
                if (priorWeights) {
                    for (let i = 0; i < priorWeights.length; i++) {
                        priorWeightsObj[String(i)] = priorWeights[i];
                    }
                }

                await updateJobProgress(jobId, 2, 1, 2, 'Running MCTS search...');

                // ── Step 2a.2: MCTS Search ──
                const mctsResult = mctsSearch(evalCandles, allData, {
                    priorWeights,
                    lookForward,
                    interval: safeInterval,
                    simulations: DEFAULT_MCTS_ITERATIONS,
                    maxDepth: DEFAULT_MCTS_MAX_DEPTH,
                });

                const allCombos: string[][] = mctsResult.all.map(
                    (s: { indicators: string[] }) => s.indicators,
                );
                const top10Mcts = mctsResult.all?.slice(0, 10) ?? [];

                executionTimes.phase2a = Date.now() - start;

                // ── Checkpoint: Save to MongoDB ──
                await connectToDatabase();
                await AIJob.updateOne(
                    { jobId },
                    {
                        $set: {
                            'intermediateResults.miPriorWeights': priorWeightsObj,
                            'intermediateResults.mctsCombos': allCombos,
                            'intermediateResults.mctsTop10': top10Mcts.map((s: any) => ({
                                indicators: s.indicators,
                                compositeScore: s.compositeScore,
                                visits: s.visits,
                            })),
                            'intermediateResults.mctsPhase': 'completed',
                        },
                    },
                );

                await updateJobProgress(
                    jobId, 2, 2, 2,
                    `MCTS complete: ${allCombos.length} combos explored`,
                );

                // ── Guard: No combos found → fail fast with descriptive error ──
                if (allCombos.length === 0) {
                    throw new Error(
                        `MCTS search produced zero valid combinations for ${symbol}. ` +
                        `Insufficient signal quality — try a shorter date range or different interval.`,
                    );
                }

                // Lightweight return — only combo indices and scores
                return {
                    allCombos,
                    mctsTotalPaths: mctsResult.all?.length ?? 0,
                    mctsTop10Summary: top10Mcts.map((s: any) => ({
                        indicators: s.indicators,
                        score: s.compositeScore,
                    })),
                };
            });

            // ═══════════════════════════════════════════════════════════
            // Phase 3a: Hyperband Bracket 1 (25% mask density)
            // Evaluates ALL MCTS combos at lowest fidelity (fastest).
            // Promotes top 1/η (≈ top 1/3) to the next bracket.
            // ═══════════════════════════════════════════════════════════
            const phase3aResult = await step.run('phase-3a-bracket-25', async () => {
                const start = Date.now();
                const { candles, allData } = phase1Data;
                const lookForward = DEFAULT_LOOK_FORWARD;
                const evalCandles = candles.length > DEFAULT_MAX_CANDLES
                    ? candles.slice(candles.length - DEFAULT_MAX_CANDLES)
                    : candles;

                const allCombos = phase2aResult.allCombos;
                const density = MASK_DENSITIES[0]; // 0.25

                await updateJobProgress(
                    jobId, 3, 0, allCombos.length,
                    `Bracket 1/3 (25% density): evaluating ${allCombos.length} combos...`,
                );

                // Execute bracket at 25% density (no DE at this level)
                const bracketResults = executeBracket(
                    allCombos,
                    0,      // bracketLevel
                    density,
                    evalCandles,
                    allData,
                    lookForward,
                    safeInterval,
                    undefined, // no DE at 25%
                    undefined,
                    signalProfile,
                );

                // Promote top combos to next bracket
                const promotedCombos = promoteCombos(bracketResults, allCombos, ETA);

                executionTimes.phase3a = Date.now() - start;

                // ── Checkpoint: Save survivors to MongoDB ──
                await connectToDatabase();
                await AIJob.updateOne(
                    { jobId },
                    {
                        $set: {
                            'intermediateResults.bracket25Results': bracketResults.map(bracketToCheckpoint),
                            'intermediateResults.bracket25Promoted': promotedCombos,
                            'intermediateResults.bracket25Count': bracketResults.length,
                        },
                    },
                );

                await updateJobProgress(
                    jobId, 3, bracketResults.length, allCombos.length,
                    `Bracket 1/3 complete: ${bracketResults.length} survivors → ${promotedCombos.length} promoted`,
                );

                // ── Guard: No combos promoted → fail fast ──
                if (promotedCombos.length === 0) {
                    throw new Error(
                        `Hyperband bracket 1 eliminated all ${allCombos.length} candidate combinations for ${symbol}. ` +
                        `No viable strategies found at 25% mask density.`,
                    );
                }

                return {
                    bracketResults: bracketResults.map(bracketToCheckpoint),
                    promotedCombos,
                };
            });

            // ═══════════════════════════════════════════════════════════
            // Phase 3b: Hyperband Bracket 2 (50% mask density)
            // Evaluates promoted combos at medium fidelity.
            // Promotes top 1/η to the final bracket.
            // ═══════════════════════════════════════════════════════════
            const phase3bResult = await step.run('phase-3b-bracket-50', async () => {
                const start = Date.now();
                const { candles, allData } = phase1Data;
                const lookForward = DEFAULT_LOOK_FORWARD;
                const evalCandles = candles.length > DEFAULT_MAX_CANDLES
                    ? candles.slice(candles.length - DEFAULT_MAX_CANDLES)
                    : candles;

                const inputCombos = phase3aResult.promotedCombos;
                const density = MASK_DENSITIES[1]; // 0.50

                await updateJobProgress(
                    jobId, 3, 0, inputCombos.length,
                    `Bracket 2/3 (50% density): evaluating ${inputCombos.length} combos...`,
                );

                // Execute bracket at 50% density (no DE at this level)
                const bracketResults = executeBracket(
                    inputCombos,
                    1,      // bracketLevel
                    density,
                    evalCandles,
                    allData,
                    lookForward,
                    safeInterval,
                    undefined, // no DE at 50%
                    undefined,
                    signalProfile,
                );

                // Promote top combos to final bracket
                const promotedCombos = promoteCombos(bracketResults, inputCombos, ETA);

                executionTimes.phase3b = Date.now() - start;

                // ── Checkpoint: Save survivors to MongoDB ──
                await connectToDatabase();
                await AIJob.updateOne(
                    { jobId },
                    {
                        $set: {
                            'intermediateResults.bracket50Results': bracketResults.map(bracketToCheckpoint),
                            'intermediateResults.bracket50Promoted': promotedCombos,
                            'intermediateResults.bracket50Count': bracketResults.length,
                        },
                    },
                );

                await updateJobProgress(
                    jobId, 3, bracketResults.length, inputCombos.length,
                    `Bracket 2/3 complete: ${bracketResults.length} survivors → ${promotedCombos.length} promoted`,
                );

                // ── Guard: No combos promoted → fail fast ──
                if (promotedCombos.length === 0) {
                    throw new Error(
                        `Hyperband bracket 2 eliminated all ${inputCombos.length} remaining candidates for ${symbol}. ` +
                        `No viable strategies found at 50% mask density.`,
                    );
                }

                return {
                    bracketResults: bracketResults.map(bracketToCheckpoint),
                    promotedCombos,
                };
            });

            // ═══════════════════════════════════════════════════════════
            // Phase 3c: Hyperband Bracket 3 + DE (100% mask density)
            // Evaluates survivors at full fidelity, runs DE parameter
            // optimization on each. Produces final survivor list.
            // ═══════════════════════════════════════════════════════════
            const phase3cResult = await step.run('phase-3c-bracket-100-de', async () => {
                const start = Date.now();
                const { candles, allData } = phase1Data;
                const lookForward = DEFAULT_LOOK_FORWARD;
                const evalCandles = candles.length > DEFAULT_MAX_CANDLES
                    ? candles.slice(candles.length - DEFAULT_MAX_CANDLES)
                    : candles;

                const inputCombos = phase3bResult.promotedCombos;
                const density = MASK_DENSITIES[2]; // 1.0

                await updateJobProgress(
                    jobId, 3, 0, inputCombos.length,
                    `Bracket 3/3 (100% + DE): optimizing ${inputCombos.length} combos...`,
                );

                // Execute bracket at 100% density WITH DE parameter optimization
                const bracketResults = executeBracket(
                    inputCombos,
                    2,      // bracketLevel
                    density,
                    evalCandles,
                    allData,
                    lookForward,
                    safeInterval,
                    { seed }, // DE options
                    undefined,
                    signalProfile,
                );

                // At final level, ALL evaluated results are survivors
                const allSurvivors = bracketResults.filter(
                    (r) => r.survived || r.compositeScore > 0,
                );

                // Sort by composite score descending
                allSurvivors.sort((a, b) => b.compositeScore - a.compositeScore);

                executionTimes.phase3c = Date.now() - start;

                // ── Checkpoint: Save final survivors to MongoDB ──
                await connectToDatabase();
                await AIJob.updateOne(
                    { jobId },
                    {
                        $set: {
                            'intermediateResults.bracket100Results': allSurvivors.map(bracketToCheckpoint),
                            'intermediateResults.finalSurvivorCount': allSurvivors.length,
                        },
                    },
                );

                await updateJobProgress(
                    jobId, 3, allSurvivors.length, inputCombos.length,
                    `DE complete: ${allSurvivors.length} final strategies`,
                );

                return {
                    bracketResults: allSurvivors.map(bracketToCheckpoint),
                    allSurvivorsCount: allSurvivors.length,
                };
            });

            // ═══════════════════════════════════════════════════════════
            // Phase 4: Strategy Portfolio Building
            // Converts final survivors → DiscoveredStrategy[], builds
            // a low-correlation strategy portfolio using regime analysis.
            // ═══════════════════════════════════════════════════════════
            const phase4Result = await step.run('phase-4-build-portfolio', async () => {
                const start = Date.now();
                const { candles, allData } = phase1Data;

                // Reconstruct HyperbandBracketResult[] from checkpoint entries
                const survivorEntries: BracketCheckpointEntry[] = phase3cResult.bracketResults;
                const survivors = survivorEntries.map(checkpointToBracket);

                // Map to DiscoveredStrategy[]
                const allDiscovered = bracketToDiscoveredStrategy(survivors);

                // Sort by composite score × sqrt(signals), assign rank
                allDiscovered.sort((a, b) => {
                    const scoreA = a.winRate * Math.sqrt(a.totalSignals);
                    const scoreB = b.winRate * Math.sqrt(b.totalSignals);
                    return scoreB - scoreA;
                });
                allDiscovered.forEach((ds, idx) => {
                    ds.rank = idx + 1;
                });

                const topCandidates = allDiscovered.slice(0, Math.min(20, allDiscovered.length));

                await updateJobProgress(
                    jobId, 4, 0, topCandidates.length,
                    `Building portfolio from ${topCandidates.length} candidates...`,
                );

                let portfolio: StrategyPortfolio = {
                    strategies: [],
                    selectedRegime: 'neutral',
                    regimeStrategyWeights: {
                        uptrend: [], downtrend: [], ranging: [], volatile: [], neutral: [],
                    },
                    createdAt: new Date(),
                    symbol,
                    interval: safeInterval,
                };

                // Try building portfolio with up to MAX_PORTFOLIO_BUILD_ATTEMPTS
                // Fallback: relax correlation threshold if too few candidates pass
                const correlationThresholds = [0.70, 0.80, 0.90];
                for (let attempt = 0; attempt < MAX_PORTFOLIO_BUILD_ATTEMPTS; attempt++) {
                    const threshold = correlationThresholds[attempt] ?? 0.90;
                    try {
                        portfolio = buildPortfolio(
                            candles as Candle[],
                            allData,
                            topCandidates,
                            {
                                symbol,
                                interval: safeInterval,
                                maxPortfolioSize: PORTFOLIO_TARGET_SIZE,
                                correlationThreshold: threshold,
                            },
                        );
                        if (portfolio.strategies.length >= 2) break;
                    } catch {
                        // Fall through to next attempt with relaxed threshold
                    }
                }

                executionTimes.phase4 = Date.now() - start;

                // ── Checkpoint: Save portfolio to MongoDB ──
                await connectToDatabase();
                await AIJob.updateOne(
                    { jobId },
                    {
                        $set: {
                            'intermediateResults.portfolio': {
                                strategyCount: portfolio.strategies.length,
                                selectedRegime: portfolio.selectedRegime,
                                strategyIds: portfolio.strategies.map((s) => s.id),
                                strategies: portfolio.strategies.map((s) => ({
                                    id: s.id,
                                    indicators: s.indicators,
                                    overallWinRate: s.overallWinRate,
                                    overallSharpe: s.overallSharpe,
                                    regimeCount: s.regimePerformance.length,
                                })),
                            },
                            'intermediateResults.allCandidates': allDiscovered.map((ds) => ({
                                indicators: ds.indicators,
                                winRate: ds.winRate,
                                sharpeRatio: ds.sharpeRatio,
                                profitFactor: ds.profitFactor,
                                rank: ds.rank,
                                totalSignals: ds.totalSignals,
                            })),
                        },
                    },
                );

                await updateJobProgress(
                    jobId, 4, portfolio.strategies.length, PORTFOLIO_TARGET_SIZE,
                    `Portfolio built: ${portfolio.strategies.length} strategies selected`,
                );

                return {
                    portfolio,
                    allCandidates: allDiscovered,
                };
            });

            // ═══════════════════════════════════════════════════════════
            // Phase 5: Mark Job Completed + Save Report
            // ═══════════════════════════════════════════════════════════
            await step.run('phase-5-save-report', async () => {
                await connectToDatabase();

                const { portfolio, allCandidates } = phase4Result;

                // Total duration across all phases
                const discoveryDuration = Object.values(executionTimes).reduce(
                    (sum, ms) => sum + ms, 0,
                );

                // Map DiscoveredStrategy[] → DiscoveryStrategyResult[] for report
                const discoveryResults: DiscoveryStrategyResult[] = allCandidates.map(
                    (ds, idx) => ({
                        combo: ds.indicators,
                        bestParams: ds.params,
                        bestWinRate: ds.winRate,
                        validatedWinRate: ds.winRate,
                        overfittingRisk: 0,
                        riskLevel: 'low' as const,
                        totalSignals: ds.totalSignals,
                        rank: idx + 1,
                        badge: `${ds.indicators.length}-IND` as any,
                    }),
                );

                // Update AIJob status
                await AIJob.updateOne(
                    { jobId },
                    {
                        $set: {
                            status: 'completed',
                            progress: 100,
                            currentPhase: 5,
                            phaseDetail: 'Discovery complete — Strategy Portfolio built',
                            discoveryResults: discoveryResults, // Uses mapped DiscoveryStrategyResult[] with `combo` field
                            executionTimes,
                            completedAt: new Date(),
                            // Store the portfolio for downstream use
                            'intermediateResults.portfolioFinal': {
                                strategyCount: portfolio.strategies.length,
                                strategies: portfolio.strategies.map((s) => ({
                                    id: s.id,
                                    indicators: s.indicators,
                                    params: s.params,
                                    overallWinRate: s.overallWinRate,
                                    overallSharpe: s.overallSharpe,
                                    overallProfitFactor: s.overallProfitFactor,
                                    regimePerformance: s.regimePerformance,
                                })),
                                regimeWeights: portfolio.regimeStrategyWeights,
                                selectedRegime: portfolio.selectedRegime,
                            },
                        },
                    },
                );

                // Create a Report document for the Archive
                const report = await Report.create({
                    jobId,
                    userId,
                    symbol,
                    indicator: 'discovery',
                    bestValue: allCandidates[0]?.winRate ?? null,
                    winRate: allCandidates[0]?.winRate ?? null,
                    status: 'completed',
                    steps: [],
                    fullData: null,
                    type: 'discovery',
                    discoveryResults,
                    discoveryConfig: {
                        symbol,
                        interval: safeInterval,
                        years,
                        ...(signalProfile ? { signalProfile } : {}),
                    },
                    totalCombinationsScreened: allCandidates.length,
                    discoveryDuration,
                    rerunOfArtifactId: rerunOfArtifactId || undefined,
                });

                // Create notification with actionUrl linking to report detail page
                await Notification.create({
                    userId,
                    type: 'ai_job_completed',
                    title: 'Deep Discovery Tamamlandı',
                    message:
                        `${symbol} için ${allCandidates.length} strateji bulundu. ` +
                        `Portföy: ${portfolio.strategies.length} strateji seçildi. ` +
                        `En iyi: ${allCandidates[0]?.indicators?.join(' + ') || 'N/A'} ` +
                        `(%${allCandidates[0]?.winRate?.toFixed(1) || '0'})`,
                    jobId,
                    actionUrl: `/archive/reports/${report._id}`,
                });
            });

            // ── Final Return ──────────────────────────────────────────
            return {
                success: true,
                jobId,
                symbol,
                resultsCount: phase4Result.allCandidates.length,
                portfolioSize: phase4Result.portfolio.strategies.length,
                bestWinRate: phase4Result.allCandidates[0]?.winRate ?? 0,
                executionTimes,
            };
        } catch (e) {
            // Mark job as failed
            const errorMsg = e instanceof Error ? e.message : String(e);
            await step.run('mark-failed', async () => {
                await connectToDatabase();
                await AIJob.updateOne(
                    { jobId },
                    {
                        $set: {
                            status: 'failed',
                            errorMessage: errorMsg,
                            executionTimes,
                        },
                    },
                );

                await Notification.create({
                    userId,
                    type: 'ai_job_failed',
                    title: 'Deep Discovery Başarısız',
                    message:
                        `${symbol} için keşif sırasında bir hata oluştu: ${errorMsg.slice(0, 200)}`,
                    jobId,
                });
            });

            return { success: false, jobId, error: errorMsg };
        }
    },
);
