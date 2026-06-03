import { describe, it, expect } from 'vitest';
import { INDICATOR_TO_ALLDATA_FIELD } from './indicator-all-data-map';

describe('INDICATOR_TO_ALLDATA_FIELD', () => {
    it('should map all 17 indicator keys to AllData fields', () => {
        const expectedKeys = [
            'rsi', 'macd', 'stochrsi', 'wavetrend', 'dmi',
            'mfi', 'smi', 'cci', 'wpr', 'di', 'cmf', 'madr',
            'alma', 'bb', 'ao', 'ad', 'netvol',
        ];

        for (const key of expectedKeys) {
            expect(INDICATOR_TO_ALLDATA_FIELD).toHaveProperty(key);
            expect(typeof INDICATOR_TO_ALLDATA_FIELD[key]).toBe('string');
            expect(INDICATOR_TO_ALLDATA_FIELD[key]).toMatch(/Data$/);
        }
    });

    it('should have exactly 17 entries', () => {
        expect(Object.keys(INDICATOR_TO_ALLDATA_FIELD).length).toBe(17);
    });

    it('should map each indicator to a unique field', () => {
        const values = Object.values(INDICATOR_TO_ALLDATA_FIELD);
        const uniqueValues = new Set(values);
        expect(uniqueValues.size).toBe(values.length);
    });

    it('should map ao to aoData', () => {
        expect(INDICATOR_TO_ALLDATA_FIELD.ao).toBe('aoData');
    });

    it('should map netvol to nvData', () => {
        expect(INDICATOR_TO_ALLDATA_FIELD.netvol).toBe('nvData');
    });

    it('should map bb to bbData', () => {
        expect(INDICATOR_TO_ALLDATA_FIELD.bb).toBe('bbData');
    });
});
