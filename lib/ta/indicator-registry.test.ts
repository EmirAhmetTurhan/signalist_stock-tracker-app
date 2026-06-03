import { describe, it, expect } from 'vitest';
import { detectAvailableIndicators, DISCOVERY_POOL } from './indicator-registry';

describe('indicator-registry', () => {
    describe('detectAvailableIndicators', () => {
        it('should return an array of lowercase indicator names', () => {
            const indicators = detectAvailableIndicators();

            expect(Array.isArray(indicators)).toBe(true);
            expect(indicators.length).toBeGreaterThan(0);

            // All indicators should be lowercase
            indicators.forEach(indicator => {
                expect(indicator).toBe(indicator.toLowerCase());
            });
        });

        it('should return sorted indicators alphabetically', () => {
            const indicators = detectAvailableIndicators();
            const sorted = [...indicators].sort();

            expect(indicators).toEqual(sorted);
        });

        it('should return all 17 current indicators', () => {
            const indicators = detectAvailableIndicators();

            // Based on OPTIMIZABLE_INDICATORS in optimizer.ts
            // Note: BB is an alias for BOLLINGER, so we expect unique indicators
            expect(indicators.length).toBe(17);
        });

        it('should include expected indicators', () => {
            const indicators = detectAvailableIndicators();

            // Check for some known indicators
            expect(indicators).toContain('rsi');
            expect(indicators).toContain('macd');
            expect(indicators).toContain('stochrsi');
            expect(indicators).toContain('wavetrend');
            expect(indicators).toContain('dmi');
            expect(indicators).toContain('mfi');
            expect(indicators).toContain('smi');
            expect(indicators).toContain('cci');
            expect(indicators).toContain('wpr');
            expect(indicators).toContain('di');
            expect(indicators).toContain('cmf');
            expect(indicators).toContain('madr');
            expect(indicators).toContain('alma');
            expect(indicators).toContain('bb');
        });

        it('should not contain duplicates', () => {
            const indicators = detectAvailableIndicators();
            const uniqueIndicators = [...new Set(indicators)];

            expect(indicators.length).toBe(uniqueIndicators.length);
        });
    });

    describe('DISCOVERY_POOL', () => {
        it('should be an exported constant array', () => {
            expect(Array.isArray(DISCOVERY_POOL)).toBe(true);
            expect(DISCOVERY_POOL.length).toBeGreaterThan(0);
        });

        it('should match the output of detectAvailableIndicators', () => {
            const detected = detectAvailableIndicators();

            // DISCOVERY_POOL is generated once at module load
            // It should contain the same indicators
            expect(DISCOVERY_POOL.length).toBe(detected.length);

            // Check all indicators are present
            detected.forEach(indicator => {
                expect(DISCOVERY_POOL).toContain(indicator);
            });
        });

        it('should be sorted alphabetically', () => {
            const sorted = [...DISCOVERY_POOL].sort();
            expect(DISCOVERY_POOL).toEqual(sorted);
        });
    });
});
