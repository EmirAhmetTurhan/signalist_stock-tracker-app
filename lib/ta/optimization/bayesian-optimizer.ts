// lib/ta/bayesian-optimizer.ts — Tree-structured Parzen Estimator (TPE)
// Bayesian hyperparameter optimization for continuous strategy parameters.
// Replaces brute-force search in optimizeStrategyParams for lookback periods,
// thresholds, and other continuous params while GA handles discrete combinatorial selection.
//
// Algorithm:
//   1. Sample nInitial random points
//   2. Split into "good" (top gamma%) and "bad" (bottom (1-gamma)%)
//   3. Build KDE (Parzen windows) for good and bad groups per parameter
//   4. Sample candidate from good-KDE, evaluate, update
//   5. Expected Improvement (EI) guides next samples
//   6. Return best params after nEIOptimizations

export interface BOConfig {
    paramRanges: Record<string, [number, number]>;
    nInitialSamples: number;     // Random samples before BO kicks in (default: 10)
    nEIOptimizations: number;    // Expected improvement steps (default: 30)
    gamma: number;               // Percentile split (default: 0.15 → top 15% = "good")
}

export interface BOObservation {
    params: Record<string, number>;
    winRate: number;
}

type EvalFn = (params: Record<string, number>) => { winRate: number; totalSignals: number };

const DEFAULT_CONFIG: Required<BOConfig> = {
    paramRanges: {},
    nInitialSamples: 10,
    nEIOptimizations: 30,
    gamma: 0.15,
};

/**
 * Kernel Density Estimation with Gaussian (Parzen) windows.
 * For a given parameter, estimates density from a set of observations.
 */
function parzenDensity(
    candidate: number,
    observations: number[],
    bandwidth: number
): number {
    if (observations.length === 0) return 1;
    const n = observations.length;
    let density = 0;
    for (const obs of observations) {
        const diff = (candidate - obs) / bandwidth;
        // Gaussian kernel: exp(-0.5 * diff^2) / sqrt(2*pi)
        density += Math.exp(-0.5 * diff * diff);
    }
    return density / (n * bandwidth * Math.SQRT2 * Math.sqrt(Math.PI));
}

/**
 * Sample a parameter value from a KDE model using inverse transform sampling.
 * Uses a simple grid approximation for speed (TypeScript-friendly).
 */
function sampleFromKDE(
    observations: number[],
    paramMin: number,
    paramMax: number,
    bandwidth: number,
    rng: () => number = Math.random
): number {
    if (observations.length === 0) {
        return paramMin + rng() * (paramMax - paramMin);
    }

    // Grid-based approximate sampling: evaluate density at 100 points, normalize, sample
    const gridPoints = 100;
    const step = (paramMax - paramMin) / gridPoints;
    const densities: number[] = [];
    let totalDensity = 0;

    for (let i = 0; i <= gridPoints; i++) {
        const x = paramMin + i * step;
        const d = parzenDensity(x, observations, bandwidth);
        densities.push(d);
        totalDensity += d;
    }

    if (totalDensity <= 0) {
        return paramMin + rng() * (paramMax - paramMin);
    }

    // Normalize CDF
    const cdf: number[] = [];
    let cumSum = 0;
    for (const d of densities) {
        cumSum += d / totalDensity;
        cdf.push(cumSum);
    }

    // Sample from CDF
    const u = rng();
    for (let i = 0; i < cdf.length; i++) {
        if (u <= cdf[i]) {
            return paramMin + i * step + (rng() - 0.5) * step * 0.5; // jitter
        }
    }

    return paramMin + rng() * (paramMax - paramMin);
}

/**
 * Scott's rule for bandwidth selection: h = n^(-1/(d+4)) * sigma
 * For 1D: h = n^(-0.2) * sigma
 */
function estimateBandwidth(values: number[]): number {
    if (values.length < 2) return 0.1;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
    const std = Math.sqrt(variance);
    const n = values.length;
    return Math.max(0.01, std * Math.pow(n, -0.2));
}

/**
 * Generate a random parameter value uniformly within range.
 */
function randomParam(paramMin: number, paramMax: number, rng: () => number = Math.random): number {
    const val = paramMin + rng() * (paramMax - paramMin);
    // Round to nearest integer for discrete-ish params like lookback periods
    if (paramMax - paramMin < 100) return Math.round(val);
    return Math.round(val * 100) / 100;
}

/**
 * Bayesian Optimization with Tree-structured Parzen Estimator.
 *
 * @param config - Optimization configuration (param ranges, iterations)
 * @param evaluateFn - Function to evaluate a parameter set; returns winRate and totalSignals
 * @returns The best parameter set found
 */
export function bayesianOptimize(
    config: BOConfig,
    evaluateFn: EvalFn
): Record<string, number> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const { paramRanges, nInitialSamples, nEIOptimizations, gamma } = cfg;
    const paramNames = Object.keys(paramRanges);

    if (paramNames.length === 0) return {};

    const observations: BOObservation[] = [];

    // ── Phase 1: Initial random sampling ──
    for (let i = 0; i < nInitialSamples; i++) {
        const params: Record<string, number> = {};
        for (const name of paramNames) {
            const [min, max] = paramRanges[name];
            params[name] = randomParam(min, max);
        }

        const result = evaluateFn(params);
        if (result.totalSignals >= 10) { // Minimum signal threshold
            observations.push({ params, winRate: result.winRate });
        }
    }

    if (observations.length === 0) {
        // Fallback: return midpoint of all ranges
        const fallback: Record<string, number> = {};
        for (const name of paramNames) {
            const [min, max] = paramRanges[name];
            fallback[name] = Math.round((min + max) / 2);
        }
        return fallback;
    }

    // ── Phase 2: TPE optimization iterations ──
    for (let iter = 0; iter < nEIOptimizations; iter++) {
        // Sort by winRate descending
        observations.sort((a, b) => b.winRate - a.winRate);

        // Split into "good" (top gamma%) and "bad" (bottom)
        const nGood = Math.max(1, Math.floor(observations.length * gamma));
        const goodObs = observations.slice(0, nGood);
        const badObs = observations.slice(nGood);

        if (badObs.length === 0) continue; // All observations are good — can't improve

        // Build KDE for each parameter from good and bad groups
        const candidateParams: Record<string, number> = {};

        for (const name of paramNames) {
            const [min, max] = paramRanges[name];
            const goodValues = goodObs.map(o => o.params[name]);
            const badValues = badObs.map(o => o.params[name]);

            // Bandwidth: use Scott's rule on the "good" group
            const bandwidth = estimateBandwidth(goodValues);

            // Sample from "good" KDE (TPE: l(x) from good, g(x) from bad)
            // We want to maximize l(x)/g(x) ratio
            // Strategy: sample from good KDE, accept with probability proportional to EI

            // Generate candidate from "good" group KDE
            let candidate = sampleFromKDE(goodValues, min, max, bandwidth);

            // Compute expected improvement ratio: l(x) / g(x)
            const lx = parzenDensity(candidate, goodValues, bandwidth) + 1e-10;
            const gx = parzenDensity(candidate, badValues, bandwidth) + 1e-10;
            const eiRatio = lx / gx;

            // Accept with probability proportional to EI ratio (simulated annealing style)
            if (eiRatio < 0.5 && Math.random() > eiRatio) {
                // Re-sample: try again
                candidate = sampleFromKDE(goodValues, min, max, bandwidth);
            }

            candidateParams[name] = Math.max(min, Math.min(max, Math.round(candidate * 100) / 100));
        }

        // Evaluate candidate
        const result = evaluateFn(candidateParams);
        if (result.totalSignals >= 10) {
            observations.push({ params: candidateParams, winRate: result.winRate });
        }

        // Keep observations bounded (prevent memory growth)
        if (observations.length > 200) {
            observations.sort((a, b) => b.winRate - a.winRate);
            observations.splice(100); // Keep top 100
        }
    }

    // Return best params
    observations.sort((a, b) => b.winRate - a.winRate);
    return observations[0].params;
}
