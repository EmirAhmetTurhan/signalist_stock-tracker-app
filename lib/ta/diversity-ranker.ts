// lib/ta/diversity-ranker.ts — Diversity Ranking Algorithm
// Phase 4 of the Deep Discovery pipeline.
// Ensures Top 10 results span different indicator counts (2-ind, 3-ind, 4-ind...)
// instead of all results having the same indicator count.

import type { SurrogateResult, DiverseStrategy, DiversityBadge } from './discovery-types';

// ─── Configuration ──────────────────────────────────────────────────────────────

/** Maximum results to return. */
const TOP_N = 10;

/** Maximum number of strategies with the same indicator count in Top N. */
const MAX_SAME_COUNT = 3;

// ─── Main Ranking Function ──────────────────────────────────────────────────────

/**
 * Select diverse Top 10 strategies from optimized candidates.
 *
 * Algorithm:
 * 1. Group candidates by indicator count (2, 3, 4, 5, ...)
 * 2. Select the best (highest winRate) from each group → guaranteed diversity
 * 3. Fill remaining slots with next-highest winRate strategies,
 *    respecting MAX_SAME_COUNT per indicator count
 * 4. Sort final result by bestWinRate descending
 *
 * @param candidates - Optimized strategies from Phase 3 (surrogate optimizer)
 * @returns Top 10 DiverseStrategy[] with diversity badges and ranks
 */
export function selectDiverseTop10(candidates: SurrogateResult[]): DiverseStrategy[] {
    if (candidates.length === 0) return [];

    // Sort candidates by winRate descending for consistent selection
    const sorted = [...candidates].sort((a, b) => b.bestWinRate - a.bestWinRate);

    // Group by indicator count
    const groups = new Map<number, SurrogateResult[]>();
    for (const candidate of sorted) {
        const count = candidate.combo.length;
        if (!groups.has(count)) {
            groups.set(count, []);
        }
        groups.get(count)!.push(candidate);
    }

    const selected: SurrogateResult[] = [];
    const countTracker = new Map<number, number>(); // indicator count → how many selected

    // Step 1: Take best from each indicator count group (guaranteed diversity)
    const sortedGroupKeys = Array.from(groups.keys()).sort((a, b) => a - b);
    for (const count of sortedGroupKeys) {
        if (selected.length >= TOP_N) break;
        const group = groups.get(count)!;
        if (group.length > 0) {
            selected.push(group[0]); // Already sorted by winRate desc
            countTracker.set(count, 1);
        }
    }

    // Step 2: Fill remaining slots with highest winRate, respecting MAX_SAME_COUNT
    for (const candidate of sorted) {
        if (selected.length >= TOP_N) break;

        // Skip if already selected
        if (selected.includes(candidate)) continue;

        const count = candidate.combo.length;
        const currentCount = countTracker.get(count) ?? 0;

        // Respect max-same-count constraint
        if (currentCount >= MAX_SAME_COUNT) continue;

        selected.push(candidate);
        countTracker.set(count, currentCount + 1);
    }

    // Convert to DiverseStrategy with badges and ranks
    // Sort final result by winRate descending
    selected.sort((a, b) => b.bestWinRate - a.bestWinRate);

    return selected.map((s, idx) => ({
        ...s,
        indicatorCount: s.combo.length,
        badge: `${s.combo.length}-IND` as DiversityBadge,
        rank: idx + 1,
    }));
}
