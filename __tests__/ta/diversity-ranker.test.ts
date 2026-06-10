import { describe, it, expect } from 'vitest';
import { selectDiverseTop10 } from '@/lib/ta/diversity-ranker';
import type { SurrogateResult } from '@/lib/ta/discovery-types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeResult(combo: string[], bestWinRate: number): SurrogateResult {
    return {
        combo,
        bestParams: { lookForward: 14 },
        bestWinRate,
        totalSignals: 100,
        iterationsRun: 50,
        mode: 'all',
    };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('selectDiverseTop10', () => {
    it('should return empty array for empty input', () => {
        expect(selectDiverseTop10([])).toEqual([]);
    });

    it('should return all candidates when less than 10', () => {
        const candidates = [
            makeResult(['rsi', 'macd'], 65),
            makeResult(['rsi', 'macd', 'dmi'], 60),
        ];
        const result = selectDiverseTop10(candidates);
        expect(result.length).toBe(2);
    });

    it('should include diversity badges and ranks', () => {
        const candidates = [
            makeResult(['rsi', 'macd'], 65),
            makeResult(['rsi', 'macd', 'dmi'], 60),
        ];
        const result = selectDiverseTop10(candidates);

        expect(result[0]).toHaveProperty('indicatorCount');
        expect(result[0]).toHaveProperty('badge');
        expect(result[0]).toHaveProperty('rank');
        expect(result[0].badge).toMatch(/^\d+-IND$/);
        expect(result[0].rank).toBe(1);
    });

    it('should select at least one from each indicator count group', () => {
        // Create candidates with different indicator counts
        const candidates = [
            makeResult(['a', 'b'], 50),
            makeResult(['a', 'b', 'c'], 55),
            makeResult(['a', 'b', 'c', 'd'], 60),
            makeResult(['a', 'b', 'c', 'd', 'e'], 65),
        ];

        const result = selectDiverseTop10(candidates);

        // Should include at least one of each indicator count
        const counts = new Set(result.map(r => r.indicatorCount));
        expect(counts.has(2)).toBe(true);
        expect(counts.has(3)).toBe(true);
        expect(counts.has(4)).toBe(true);
        expect(counts.has(5)).toBe(true);
    });

    it('should respect MAX_SAME_COUNT = 3 per indicator count', () => {
        // Create 5 candidates with 2-ind and 5 candidates with 3-ind
        const candidates: SurrogateResult[] = [
            ...Array.from({ length: 5 }, (_, i) => makeResult(['a', 'b'], 60 + i)),
            ...Array.from({ length: 5 }, (_, i) => makeResult(['a', 'b', 'c'], 55 + i)),
        ];

        const result = selectDiverseTop10(candidates);

        // Count how many of each indicator count
        const count2 = result.filter(r => r.indicatorCount === 2).length;
        const count3 = result.filter(r => r.indicatorCount === 3).length;

        // At most 3 of the same count
        expect(count2).toBeLessThanOrEqual(3);
        expect(count3).toBeLessThanOrEqual(3);
    });

    it('should return at most 10 results', () => {
        const candidates = Array.from(
            { length: 20 },
            (_, i) => makeResult(
                Array.from({ length: 2 + (i % 5) }, (_, j) => `ind${j}`),
                50 + i,
            ),
        );

        const result = selectDiverseTop10(candidates);
        expect(result.length).toBeLessThanOrEqual(10);
    });

    it('should sort results by bestWinRate descending', () => {
        const candidates = [
            makeResult(['a', 'b'], 45),
            makeResult(['c', 'd'], 75),
            makeResult(['e', 'f'], 60),
        ];

        const result = selectDiverseTop10(candidates);
        for (let i = 1; i < result.length; i++) {
            expect(result[i - 1].bestWinRate).toBeGreaterThanOrEqual(result[i].bestWinRate);
        }
    });

    it('should assign unique ranks 1..N', () => {
        const candidates = Array.from(
            { length: 8 },
            (_, i) => makeResult(
                Array.from({ length: 2 + (i % 4) }, (_, j) => `ind${j}_${i}`),
                50 + i,
            ),
        );

        const result = selectDiverseTop10(candidates);
        const ranks = result.map(r => r.rank);
        expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7, 8].slice(0, ranks.length));
    });
});
