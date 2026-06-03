/**
 * Bollinger Bands Reference Tests — compares computeBollingerBands output
 * against known reference values.
 *
 * Validates SMA computation and population stddev (N, not N-1).
 * Uses an oscillating price sequence with period=20, multiplier=2.
 */

import { describe, it } from 'vitest';
import { computeBollingerBands } from '@/lib/indicators/bollinger';
import { allBollingerFixtures } from '@/__tests__/fixtures/indicators/bollinger.fixture';
import { expectOutputCloseTo } from '@/__tests__/helpers/indicator-test-utils';

describe('Bollinger Bands reference tests', () => {
    for (const fixture of allBollingerFixtures) {
        it(fixture.name, () => {
            const result = computeBollingerBands(
                fixture.input,
                fixture.params.period,
                fixture.params.multiplier,
                0, // offset
            );
            expectOutputCloseTo(result, fixture.expected, 1e-9);
        });
    }
});
