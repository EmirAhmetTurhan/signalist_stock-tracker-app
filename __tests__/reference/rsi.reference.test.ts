/**
 * RSI Reference Tests — compares computeRSI output against known reference values.
 *
 * These tests validate that computeRSI produces mathematically correct output.
 * When TradingView Pine Script reference values are available, update the fixture
 * and reduce tolerance to 1e-4.
 */

import { describe, it } from 'vitest';
import { computeRSI } from '@/lib/indicators/rsi';
import { allRsiFixtures } from '@/__tests__/fixtures/indicators/rsi.fixture';
import { expectOutputCloseTo } from '@/__tests__/helpers/indicator-test-utils';

describe('RSI reference tests', () => {
    for (const fixture of allRsiFixtures) {
        it(fixture.name, () => {
            const result = computeRSI(
                fixture.input,
                fixture.params.length,
                fixture.params.maLength,
            );
            expectOutputCloseTo(result, fixture.expected, 1e-9);
        });
    }
});
