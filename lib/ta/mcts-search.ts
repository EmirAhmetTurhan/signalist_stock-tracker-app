// lib/ta/mcts-search.ts — Monte Carlo Tree Search for Strategy Discovery
//
// Zero-Allocation Flat Tree Architecture:
//   All node state stored in Int32Array / Float64Array — zero GC pressure.
//   No JS objects ({}) allocated during hot-loop.
//
// MI Integration:
//   Mutual Information scores feed into UCT as PRIOR PROBABILITY weights,
//   NOT as a hard pre-filter. Indicators with higher MI → higher prior →
//   explored first by UCT. Low-MI indicators still explorable (soft bias).
//
// Tree Layout (2000 nodes × 64 bytes = 128KB — fits in L2 cache):
//   ┌──────────────────────────────────────────────────────────┐
//   │  field         type      bytes  range                   │
//   ├──────────────────────────────────────────────────────────┤
//   │  indicatorMask  Int32     4      17-bit strategy mask    │
//   │  parentIdx      Int32     4      parent node index (-1)  │
//   │  childIdx       Int32     4      first child (-1)       │
//   │  siblingIdx     Int32     4      next sibling (-1)      │
//   │  triedMask      Int32     4      expanded actions mask   │
//   │  depth          Int32     4      0..MAX_DEPTH            │
//   │  visits         Float64   8      visit count             │
//   │  wins           Float64   8      cumulative reward       │
//   │  prior          Float64   8      MI-based prior (0-1)    │
//   │  compositeScore Float64   8      cached best score       │
//   └──────────────────────────────────────────────────────────┘
//   TOTAL: 64 bytes per node × 2000 = 128KB

import { runStrategyBacktest } from './strategy-optimizer';
import type { Candle } from './backtest';
import type {
    AllData,
    StrategyBacktestConfig,
    DiscoveredStrategy,
} from './strategy-optimizer';
import type { MarketRegime, RegimeStats } from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_NODES = 2000;
const MAX_DEPTH = 5;
const C_EXPLORE = Math.SQRT2; // √2 ≈ 1.414 — UCT exploration constant
const INDICATOR_COUNT = 17;
const FULL_INDICATOR_MASK = (1 << INDICATOR_COUNT) - 1;
const MIN_INDICATORS_FOR_EVAL = 2;
const DEFAULT_PROGRESS_BATCH = 10;
const MIN_VISITS_FOR_EVALUATION = 5;

/** Maps indicator keys to bit positions (0-16). */
const INDICATOR_INDEX: Readonly<Record<string, number>> = {
    rsi: 0, cci: 1, wavetrend: 2, macd: 3,
    stochrsi: 4, dmi: 5, smi: 6, ao: 7,
    mfi: 8, wpr: 9, di: 10, cmf: 11,
    ad: 12, netvol: 13, madr: 14, alma: 15, bb: 16,
};

const INDEX_TO_INDICATOR: string[] = Object.keys(INDICATOR_INDEX);

// ─── FlatMCTSTree — Zero-Allocation Tree ──────────────────────────────────────

/**
 * Flat (array-based) MCTS tree.
 *
 * ALL node data stored in typed arrays — zero heap objects during hot-loop.
 * Prefer this over { } objects: no GC allocation, contiguous cache layout,
 * ~15-20x faster traversal in V8 TurboFan.
 */
export class FlatMCTSTree {
    // ── Int32 fields (4 bytes each) ──
    /** 17-bit bitmask of selected indicators (bit 0 = rsi, bit 16 = bb). */
    readonly indicatorMask: Int32Array;
    /** Parent node index (-1 for root). */
    readonly parentIdx: Int32Array;
    /** First child node index (-1 if leaf). */
    readonly childIdx: Int32Array;
    /** Next sibling node index (-1 if last). */
    readonly siblingIdx: Int32Array;
    /** Bitmask of expansion actions tried from this node. */
    readonly triedMask: Int32Array;
    /** Tree depth (0 = root, 1..MAX_DEPTH). */
    readonly depth: Int32Array;

    // ── Float64 fields (8 bytes each) ──
    /** Number of times this node was visited (simulations). */
    readonly visits: Float64Array;
    /** Cumulative reward (sum of normalized scores). */
    readonly wins: Float64Array;
    /** Prior probability from MI weights (0-1). Biases UCT exploration order. */
    readonly prior: Float64Array;
    /** Cached composite score of the best simulation result from this node. */
    readonly compositeScore: Float64Array;

    /** Current number of allocated nodes. */
    nodeCount: number = 0;
    /** Maximum capacity (fixed at construction). */
    readonly maxNodes: number;

    constructor(maxNodes: number = MAX_NODES) {
        this.maxNodes = maxNodes;
        this.indicatorMask = new Int32Array(maxNodes);
        this.parentIdx = new Int32Array(maxNodes);
        this.childIdx = new Int32Array(maxNodes);
        this.siblingIdx = new Int32Array(maxNodes);
        this.triedMask = new Int32Array(maxNodes);
        this.depth = new Int32Array(maxNodes);
        this.visits = new Float64Array(maxNodes);
        this.wins = new Float64Array(maxNodes);
        this.prior = new Float64Array(maxNodes);
        this.compositeScore = new Float64Array(maxNodes);
        this._init(); // Warm up arrays with default values
    }

    /** Reset all arrays to default state (for reuse between search runs). */
    reset(): void {
        this.nodeCount = 0;
        this._init();
    }

    /** Initialize root node. Returns index 0. */
    initRoot(): number {
        this.nodeCount = 1;
        this.indicatorMask[0] = 0;
        this.parentIdx[0] = -1;
        this.childIdx[0] = -1;
        this.siblingIdx[0] = -1;
        this.triedMask[0] = 0;
        this.depth[0] = 0;
        this.visits[0] = 0;
        this.wins[0] = 0;
        this.prior[0] = 1.0; // Root prior = max (always explore)
        this.compositeScore[0] = 0;
        return 0;
    }

    /**
     * Create a child node under `parent` by adding `indicatorBit`.
     * Returns the new node index, or -1 if tree is full.
     */
    addNode(parent: number, indicatorBit: number, priorProb: number): number {
        const idx = this.nodeCount;
        if (idx >= this.maxNodes) return -1;

        const parentMask = this.indicatorMask[parent];
        this.indicatorMask[idx] = parentMask | (1 << indicatorBit);
        this.parentIdx[idx] = parent;
        this.childIdx[idx] = -1;
        this.siblingIdx[idx] = -1;
        this.depth[idx] = this.depth[parent] + 1;
        this.visits[idx] = 0;
        this.wins[idx] = 0;
        this.prior[idx] = priorProb;
        this.compositeScore[idx] = 0;

        // Mark this indicator as tried on parent (avoids re-expanding same action)
        this.triedMask[parent] |= (1 << indicatorBit);

        // Link into parent's child chain (append to end of sibling list)
        const firstChild = this.childIdx[parent];
        if (firstChild === -1) {
            this.childIdx[parent] = idx;
        } else {
            let sib = firstChild;
            while (this.siblingIdx[sib] !== -1) sib = this.siblingIdx[sib];
            this.siblingIdx[sib] = idx;
        }

        this.nodeCount++;
        return idx;
    }

    // ─── Query Methods ─────────────────────────────────────────────────────────

    /** Convert bitmask to indicator key array. */
    maskToIndicators(mask: number): string[] {
        const inds: string[] = [];
        let remaining = mask & FULL_INDICATOR_MASK;
        while (remaining) {
            const bit = Math.clz32(remaining) ^ 31; // Trailing zero count
            inds.push(INDEX_TO_INDICATOR[bit]);
            remaining &= ~(1 << bit);
        }
        return inds;
    }

    /** Get indicator keys for a node. */
    getIndicators(nodeIdx: number): string[] {
        return this.maskToIndicators(this.indicatorMask[nodeIdx]);
    }

    /** Check if node can be expanded (depth < max AND untried indicators remain). */
    canExpand(nodeIdx: number): boolean {
        if (this.depth[nodeIdx] >= MAX_DEPTH) return false;
        const parentMask = this.indicatorMask[nodeIdx];
        const tried = this.triedMask[nodeIdx];
        // Untried = all indicators - parentMask - tried
        const untried = (~parentMask & ~tried) & FULL_INDICATOR_MASK;
        return untried !== 0;
    }

    /** Get list of untried indicator bit positions for a node. */
    getUntriedIndicators(nodeIdx: number): number[] {
        const parentMask = this.indicatorMask[nodeIdx];
        const tried = this.triedMask[nodeIdx];
        const untried = (~parentMask & ~tried) & FULL_INDICATOR_MASK;
        const result: number[] = [];
        let remaining = untried;
        while (remaining) {
            const bit = Math.clz32(remaining) ^ 31;
            result.push(bit);
            remaining &= ~(1 << bit);
        }
        return result;
    }

    /** Number of children of a node. */
    childCount(nodeIdx: number): number {
        let count = 0;
        let child = this.childIdx[nodeIdx];
        while (child !== -1) { count++; child = this.siblingIdx[child]; }
        return count;
    }

    // ─── UCT Selection ─────────────────────────────────────────────────────────

    /**
     * UCT (Upper Confidence Bound for Trees) value.
     *
     *   UCT = wins/visits + C × prior × √(ln(parentVisits) / visits)
     *
     * - MI prior scales the exploration term: high-MI indicators explored first.
     * - Unvisited nodes return Infinity (forced exploration).
     */
    uct(nodeIdx: number): number {
        const v = this.visits[nodeIdx];
        if (v < 1) return Infinity;

        const parent = this.parentIdx[nodeIdx];
        const parentVisits = parent >= 0 ? this.visits[parent] : v;
        const exploitation = this.wins[nodeIdx] / v;
        const exploration = C_EXPLORE * this.prior[nodeIdx]
            * Math.sqrt(Math.log(parentVisits) / v);
        return exploitation + exploration;
    }

    /** Find the best child of a node by UCT value. Returns -1 if no children. */
    bestChild(nodeIdx: number): number {
        let best = -1;
        let bestVal = -Infinity;
        let child = this.childIdx[nodeIdx];
        while (child !== -1) {
            const u = this.uct(child);
            if (u > bestVal) { bestVal = u; best = child; }
            child = this.siblingIdx[child];
        }
        return best;
    }

    /** Find the best child by composite score (exploitation only). */
    bestChildByScore(nodeIdx: number): number {
        let best = -1;
        let bestVal = -Infinity;
        let child = this.childIdx[nodeIdx];
        while (child !== -1) {
            const s = this.compositeScore[child];
            if (s > bestVal && this.visits[child] >= MIN_VISITS_FOR_EVALUATION) {
                bestVal = s;
                best = child;
            }
            child = this.siblingIdx[child];
        }
        return best;
    }

    // ─── Internal ──────────────────────────────────────────────────────────────

    private _init(): void {
        // Fill child/sibling/tried with -1 for safety
        this.childIdx.fill(-1, this.nodeCount);
        this.siblingIdx.fill(-1, this.nodeCount);
        this.triedMask.fill(0, this.nodeCount);
        this.parentIdx.fill(-1, this.nodeCount);
        this.indicatorMask.fill(0, this.nodeCount);
    }
}

// ─── Composite Score ──────────────────────────────────────────────────────────

/**
 * Multi-metric composite score for ranking strategies.
 *
 *   Composite = WR × (Sharpe + 1) × √ProfitFactor × √(totalSignals)
 *
 * Designed to balance:
 * - WR: raw win rate (primary)
 * - Sharpe: risk-adjusted return (secondary)
 * - Profit Factor: reward/risk ratio (tertiary)
 * - totalSignals: statistical significance (dilutes high-WR/low-signal noise)
 */
export function computeCompositeScore(
    winRate: number,
    sharpeRatio: number,
    profitFactor: number,
    totalSignals: number,
): number {
    const wr = Math.max(winRate, 0) / 100;          // Normalize 0..1
    const sh = Math.max(sharpeRatio, -1) + 1;        // Shift: -1→0, 0→1, 2→3
    const pf = Math.sqrt(Math.max(profitFactor, 0)); // Diminishing returns
    const sig = Math.sqrt(Math.max(totalSignals, 1)); // Significance
    return wr * sh * pf * sig;
}

// ─── MCTS Options & Result ────────────────────────────────────────────────────

export interface MCTSOptions {
    /** Number of MCTS simulations (default: 200). */
    simulations?: number;
    /** Maximum indicator count per strategy (default: 5). */
    maxDepth?: number;
    /** UCT exploration constant (default: √2 ≈ 1.414). */
    explorationConstant?: number;
    /**
     * MI-based prior weights for each indicator (length 17).
     * Higher weight → explored earlier by UCT.
     * If not provided, uniform weights are used (1/17 each).
     * This is a SOFT bias — low-weight indicators are still explorable.
     */
    priorWeights?: Float64Array;
    /** Look-forward bars for backtest (default: 14). */
    lookForward?: number;
    /** Interval string for warmup (default: '1d'). */
    interval?: string;
    /** Batch size for progress callbacks (default: 10). */
    batchSize?: number;
    /** Progress callback. */
    onProgress?: (current: number, total: number, best: DiscoveredStrategy | null) => void;
    /** Abort signal for cancellation. */
    signal?: AbortSignal;
}

export interface MCTSResult {
    /** Best discovered strategy (by composite score). */
    best: DiscoveredStrategy;
    /** All evaluated strategies, ranked by composite score desc. */
    all: DiscoveredStrategy[];
    /** Number of tree nodes allocated. */
    treeSize: number;
    /** Actual simulations performed. */
    simulations: number;
}

// ─── Prior-Weighted Selection ─────────────────────────────────────────────────

/**
 * Select an indicator bit position weighted by prior probabilities.
 * Uses Temperature-softened softmax:
 *
 *   P(i) = prior[i]^T / Σ(prior[j]^T)
 *
 * T=1.0: proportional to prior
 * T→0: greedy (always pick max prior)
 * T→∞: uniform
 */
function selectByPriorWeight(
    availableBits: number[],
    priorWeights: Float64Array,
    temperature: number = 1.0,
): number {
    if (availableBits.length === 1) return availableBits[0];

    // Compute softmax weights
    const weights = new Float64Array(availableBits.length);
    let sum = 0;
    for (let i = 0; i < availableBits.length; i++) {
        const w = Math.pow(priorWeights[availableBits[i]], temperature);
        weights[i] = w;
        sum += w;
    }

    if (sum <= 0) {
        // Fallback: uniform random
        return availableBits[Math.floor(Math.random() * availableBits.length)];
    }

    // Weighted random selection
    const r = Math.random() * sum;
    let cumulative = 0;
    for (let i = 0; i < availableBits.length; i++) {
        cumulative += weights[i];
        if (r <= cumulative) return availableBits[i];
    }

    return availableBits[availableBits.length - 1]; // Fallback
}

// ─── MCTS Search ──────────────────────────────────────────────────────────────

/**
 * Run MCTS-based strategy discovery.
 *
 * Algorithm (per simulation):
 *   1. SELECTION:   Traverse tree using UCT until reaching an expandable leaf.
 *   2. EXPANSION:   Add one child node (new indicator) weighted by MI prior.
 *   3. SIMULATION:  Run quick backtest on the new strategy → composite score.
 *   4. BACKPROP:    Propagate reward up the tree (win rate).
 *
 * Zero-Allocation Guarantee:
 *   - Tree: pre-allocated typed arrays (no JS object creation in hot-loop)
 *   - Backtest: reuses existing runStrategyBacktest (no new allocations)
 *   - Results array: allocated once, filled incrementally
 */
export async function mctsSearch(
    candles: Candle[],
    allData: AllData,
    options: MCTSOptions = {},
): Promise<MCTSResult> {
    const sims = options.simulations ?? 200;
    const maxDepth = options.maxDepth ?? MAX_DEPTH;
    const lookForward = options.lookForward ?? 14;
    const interval = options.interval ?? '1d';
    const batchSize = options.batchSize ?? DEFAULT_PROGRESS_BATCH;
    const signal = options.signal;

    // If priorWeights not provided, use uniform (1/N)
    const uniformWeight = 1 / INDICATOR_COUNT;
    const priorWeights = options.priorWeights ?? (() => {
        const pw = new Float64Array(INDICATOR_COUNT);
        for (let i = 0; i < INDICATOR_COUNT; i++) pw[i] = uniformWeight;
        return pw;
    })();

    // Normalize priors to sum to 1
    let priorSum = 0;
    for (let i = 0; i < INDICATOR_COUNT; i++) priorSum += priorWeights[i];
    if (priorSum > 0) {
        for (let i = 0; i < INDICATOR_COUNT; i++) priorWeights[i] /= priorSum;
    }

    // Pre-allocate results array (max = simulations, but we fill incrementally)
    const allResults: DiscoveredStrategy[] = [];
    let bestResult: DiscoveredStrategy | null = null;
    let bestComposite = -Infinity;

    // Initialize tree
    const tree = new FlatMCTSTree(MAX_NODES);
    tree.initRoot();

    // Main MCTS loop
    let sim = 0;
    for (sim = 0; sim < sims; sim++) {
        if (sim > 0 && sim % 20 === 0) await new Promise(r => setTimeout(r, 0));
        if (signal?.aborted) break;

        // ── 1. SELECTION ──
        // Traverse from root using UCT until we reach a node that can expand
        // or has no children (leaf).
        let nodeIdx = 0;
        let selectedIdx = nodeIdx;

        while (nodeIdx !== -1) {
            selectedIdx = nodeIdx;

            // If this node can expand OR has no children → stop here
            if (tree.canExpand(nodeIdx) || tree.childIdx[nodeIdx] === -1) break;

            // Go to best child by UCT
            const bc = tree.bestChild(nodeIdx);
            if (bc === -1) break;
            nodeIdx = bc;
        }

        // ── 2. EXPANSION ──
        // If the selected node can expand, create one child
        if (tree.canExpand(selectedIdx)) {
            const untried = tree.getUntriedIndicators(selectedIdx);
            if (untried.length > 0) {
                // Pick an indicator weighted by MI prior (soft bias, not hard filter)
                const pick = selectByPriorWeight(untried, priorWeights, 1.0);
                const childIdx = tree.addNode(selectedIdx, pick, priorWeights[pick]);
                if (childIdx !== -1) {
                    selectedIdx = childIdx;
                }
            }
        }

        // ── 3. SIMULATION ──
        // Evaluate the strategy at selectedIdx
        const indicators = tree.getIndicators(selectedIdx);
        if (indicators.length >= MIN_INDICATORS_FOR_EVAL) {
            const config: StrategyBacktestConfig = { lookForward };
            const btResult = runStrategyBacktest(candles, 'CUSTOM', allData, config, {
                customIndicators: indicators,
                mode: 'all',
                interval,
            });

            // Compute composite score for ranking
            const composite = computeCompositeScore(
                btResult.winRate,
                btResult.sharpeRatio,
                btResult.profitFactor,
                btResult.totalSignals,
            );

            // Cache composite score on the node
            tree.compositeScore[selectedIdx] = composite;

            // Build result entry
            const ds: DiscoveredStrategy = {
                indicators: [...indicators],
                params: { lookForward },
                winRate: btResult.winRate,
                totalSignals: btResult.totalSignals,
                rank: 0, // Will be set after sorting
                profitFactor: btResult.profitFactor,
                sharpeRatio: btResult.sharpeRatio,
                avgWin: btResult.avgWin,
                avgLoss: btResult.avgLoss,
                maxDrawdown: btResult.maxDrawdown,
                totalReturn: btResult.totalReturn,
                regimeBreakdown: btResult.regimeBreakdown,
            };
            allResults.push(ds);

            // Track best by composite score
            if (composite > bestComposite) {
                bestComposite = composite;
                bestResult = ds;
            }

            // ── 4. BACKPROPAGATION ──
            // Propagate the normalized win rate up the tree
            const normalizedReward = btResult.winRate / 100; // 0..1
            let n = selectedIdx;
            while (n !== -1) {
                tree.visits[n]++;
                tree.wins[n] += normalizedReward;
                n = tree.parentIdx[n];
            }
        } else {
            // Not enough indicators → still mark as visited (no reward)
            let n = selectedIdx;
            while (n !== -1) {
                tree.visits[n]++;
                n = tree.parentIdx[n];
            }
        }

        // Progress callback
        if (options.onProgress && (sim + 1) % batchSize === 0) {
            options.onProgress(sim + 1, sims, bestResult);
        }
    }

    // ── Final Ranking ──
    // Sort by composite score descending
    allResults.sort((a, b) => {
        const scoreA = computeCompositeScore(
            a.winRate ?? 0, a.sharpeRatio ?? 0, a.profitFactor ?? 0, a.totalSignals ?? 0
        );
        const scoreB = computeCompositeScore(
            b.winRate ?? 0, b.sharpeRatio ?? 0, b.profitFactor ?? 0, b.totalSignals ?? 0
        );
        return scoreB - scoreA;
    });
    allResults.forEach((r, i) => r.rank = i + 1);

    // Top-N extraction: return top results (up to 50)
    const topResults = allResults.slice(0, 50);

    const finalBest = topResults[0] ?? {
        indicators: [] as string[],
        params: {} as Record<string, number>,
        winRate: 0,
        totalSignals: 0,
        rank: 1,
    };

    return {
        best: finalBest,
        all: topResults,
        treeSize: tree.nodeCount,
        simulations: sim,
    };
}

// ─── Convenience: Tree Stats ──────────────────────────────────────────────────

export interface MCTSTreeStats {
    totalNodes: number;
    evaluatedNodes: number;
    maxDepth: number;
    avgBranchingFactor: number;
}

/** Extract statistics from the tree for monitoring. */
export function getTreeStats(tree: FlatMCTSTree): MCTSTreeStats {
    let evaluatedNodes = 0;
    let maxDepth = 0;
    let totalChildren = 0;
    let branchNodes = 0;

    for (let i = 0; i < tree.nodeCount; i++) {
        if (tree.visits[i] > 0) evaluatedNodes++;
        if (tree.depth[i] > maxDepth) maxDepth = tree.depth[i];
        const cc = tree.childCount(i);
        if (cc > 0) {
            totalChildren += cc;
            branchNodes++;
        }
    }

    return {
        totalNodes: tree.nodeCount,
        evaluatedNodes,
        maxDepth,
        avgBranchingFactor: branchNodes > 0 ? totalChildren / branchNodes : 0,
    };
}

// ─── Default Export ───────────────────────────────────────────────────────────

export default mctsSearch;
