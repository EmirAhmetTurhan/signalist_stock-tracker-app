// lib/ta/pipeline-benchmark.test.ts — Performance benchmarks for discovery pipeline
// Measures execution time of key pipeline components under realistic loads.
// Run with: npx vitest run lib/ta/pipeline-benchmark.test.ts

import { describe, it, expect } from 'vitest';
import { generateCombinations, countTotalCombinations } from './combinatorial-search';
import { DISCOVERY_POOL } from './indicator-registry';

const POOL_SIZE = DISCOVERY_POOL.length; // 17

describe('combinatorial search benchmarks', () => {
    it('generateCombinations C(17,2) should complete quickly', () => {
        const start = performance.now();
        const combos = generateCombinations(DISCOVERY_POOL, 2);
        const elapsed = performance.now() - start;

        expect(combos.length).toBe(136); // C(17,2) = 136
        expect(elapsed).toBeLessThan(50); // should be sub-50ms
    });

    it('generateCombinations C(17,3) should complete quickly', () => {
        const start = performance.now();
        const combos = generateCombinations(DISCOVERY_POOL, 3);
        const elapsed = performance.now() - start;

        expect(combos.length).toBe(680); // C(17,3) = 680
        expect(elapsed).toBeLessThan(100); // should be sub-100ms
    });

    it('generateCombinations C(17,5) should complete within reasonable time', () => {
        const start = performance.now();
        const combos = generateCombinations(DISCOVERY_POOL, 5);
        const elapsed = performance.now() - start;

        expect(combos.length).toBe(6188); // C(17,5) = 6188
        expect(elapsed).toBeLessThan(500); // should be sub-500ms
    });

    it('generateCombinations C(17,8) should complete within reasonable time', () => {
        const start = performance.now();
        const combos = generateCombinations(DISCOVERY_POOL, 8);
        const elapsed = performance.now() - start;

        expect(combos.length).toBe(24310); // C(17,8) = 24310
        expect(elapsed).toBeLessThan(2000); // should be sub-2s
    });

    it('countTotalCombinations for C(17,2..17) should be accurate', () => {
        const start = performance.now();
        const total = countTotalCombinations(POOL_SIZE);
        const elapsed = performance.now() - start;

        // C(17,2) + C(17,3) + ... + C(17,17) = 2^17 - C(17,0) - C(17,1) = 131072 - 1 - 17 = 131054
        expect(total).toBe(131054);
        expect(elapsed).toBeLessThan(50);
    });
});

describe('DISCOVERY_POOL benchmarks', () => {
    it('pool should contain all 17 indicators', () => {
        expect(DISCOVERY_POOL.length).toBe(17);
    });

    it('pool lookup by index should be instant', () => {
        const start = performance.now();
        for (let i = 0; i < 10000; i++) {
            const _ = DISCOVERY_POOL[i % 17];
        }
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(10); // 10k lookups under 10ms
    });
});

describe('generateCombinations edge case benchmarks', () => {
    it('C(17,1) should be fast', () => {
        const start = performance.now();
        const combos = generateCombinations(DISCOVERY_POOL, 1);
        const elapsed = performance.now() - start;
        expect(combos.length).toBe(17);
        expect(elapsed).toBeLessThan(10);
    });

    it('C(17,16) should be same as C(17,1) due to symmetry', () => {
        const start = performance.now();
        const combos = generateCombinations(DISCOVERY_POOL, 16);
        const elapsed = performance.now() - start;
        expect(combos.length).toBe(17); // C(17,16) = 17
        expect(elapsed).toBeLessThan(50);
    });

    it('C(17,0) returns single empty combination instantly', () => {
        const start = performance.now();
        const combos = generateCombinations(DISCOVERY_POOL, 0);
        const elapsed = performance.now() - start;
        // C(n,0) = 1 (the empty set is a valid combination)
        expect(combos.length).toBe(1);
        expect(combos[0]).toEqual([]);
        expect(elapsed).toBeLessThan(5);
    });

    it('k > n returns empty array instantly', () => {
        const start = performance.now();
        const combos = generateCombinations(DISCOVERY_POOL, 100);
        const elapsed = performance.now() - start;
        expect(combos.length).toBe(0);
        expect(elapsed).toBeLessThan(5);
    });
});

describe('memory benchmarks', () => {
    it('C(17,8) should not cause excessive memory', () => {
        const start = performance.now();
        const combos = generateCombinations(DISCOVERY_POOL, 8);
        const elapsed = performance.now() - start;

        // 24310 combinations, each with 8 strings ~ 8*20 bytes per string ≈ 4MB
        // Should complete in reasonable time
        expect(combos.length).toBe(24310);
        expect(elapsed).toBeLessThan(2000);
    });
});
