import { INDICATOR_TO_ALLDATA_FIELD } from './indicator-all-data-map';

/**
 * Dynamically detects all available indicators from the canonical
 * INDICATOR_TO_ALLDATA_FIELD mapping. This includes both optimizable
 * and non-optimizable indicators (e.g., AO, AD, Net Volume) that
 * should be part of the discovery pool.
 *
 * Adding a new indicator to INDICATOR_TO_ALLDATA_FIELD automatically
 * includes it in the discovery pool.
 *
 * @returns Sorted array of lowercase indicator names
 */
export function detectAvailableIndicators(): string[] {
    const indicators = Object.keys(INDICATOR_TO_ALLDATA_FIELD).sort();

    // Log detected indicator count at module load
    console.log(`[IndicatorRegistry] Detected ${indicators.length} available indicators`);

    return indicators;
}

/**
 * DISCOVERY_POOL: Dynamically generated array of all available indicators.
 * Used by strategy discovery engine for exhaustive combinatorial search.
 * Automatically updates when new indicators are added to INDICATOR_TO_ALLDATA_FIELD.
 */
export const DISCOVERY_POOL = detectAvailableIndicators();
