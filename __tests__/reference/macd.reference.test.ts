/**
 * MACD Reference Tests — compares computeMACD output against known reference values.
 *
 * Validates that computeMACD produces correct EMA-based output.
 * Uses a steadily rising price sequence where MACD behavior is analytically verifiable.
 */

import { describe, it } from 'vitest';
import { computeMACD } from '@/lib/indicators/macd';
import { allMacdFixtures } from '@/__tests__/fixtures/indicators/macd.fixture';
import { expectOutputCloseTo } from '@/__tests__/helpers/indicator-test-utils';

describe('MACD reference tests', () => {
    for (const fixture of allMacdFixtures) {
        it(fixture.name, () => {
            const result = computeMACD(
                fixture.input,
                fixture.params.fast,
                fixture.params.slow,
                fixture.params.signal,
            );
            expectOutputCloseTo(result, fixture.expected, 1e-9);
        });
    }
});
