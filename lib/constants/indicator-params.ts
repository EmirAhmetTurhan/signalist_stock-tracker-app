// lib/constants/indicator-params.ts — Single source of truth for all indicator URL parameters
// Every indicator parameter is defined ONCE here. All consumers (page.tsx server,
// TAIndicatorsButton client, useTAIndicatorParams hook) derive from this registry.
// When adding a new indicator parameter, add ONE entry here.

export interface IndicatorParamDef {
    /** URL query param key, e.g. "macd_fast" */
    key: string;
    /** Which indicator this param belongs to, e.g. "macd" */
    indicator: string;
    /** Default value as a string (for URL params — always strings) */
    defaultStr: string;
    /** Default value as a number (for computation) */
    defaultNum: number;
    /** Human-readable label */
    label: string;
}

export const INDICATOR_PARAMS: readonly IndicatorParamDef[] = [
    // --- MACD ---
    { key: 'macd_fast', indicator: 'macd', defaultStr: '12', defaultNum: 12, label: 'MACD Fast' },
    { key: 'macd_slow', indicator: 'macd', defaultStr: '26', defaultNum: 26, label: 'MACD Slow' },
    { key: 'macd_sig', indicator: 'macd', defaultStr: '9', defaultNum: 9, label: 'MACD Signal' },

    // --- StochRSI ---
    { key: 'stoch_rsi_len', indicator: 'stochrsi', defaultStr: '14', defaultNum: 14, label: 'StochRSI RSI Len' },
    { key: 'stoch_len', indicator: 'stochrsi', defaultStr: '14', defaultNum: 14, label: 'StochRSI Stoch Len' },
    { key: 'stoch_k', indicator: 'stochrsi', defaultStr: '3', defaultNum: 3, label: 'StochRSI %K' },
    { key: 'stoch_d', indicator: 'stochrsi', defaultStr: '3', defaultNum: 3, label: 'StochRSI %D' },

    // --- WaveTrend ---
    { key: 'wt_avg_len', indicator: 'wavetrend', defaultStr: '21', defaultNum: 21, label: 'WT Avg Len' },
    { key: 'wt_channel_len', indicator: 'wavetrend', defaultStr: '10', defaultNum: 10, label: 'WT Channel Len' },
    { key: 'wt_ma_len', indicator: 'wavetrend', defaultStr: '4', defaultNum: 4, label: 'WT MA Len' },

    // --- DMI ---
    { key: 'dmi_di_len', indicator: 'dmi', defaultStr: '14', defaultNum: 14, label: 'DMI DI Len' },
    { key: 'dmi_adx_smooth', indicator: 'dmi', defaultStr: '14', defaultNum: 14, label: 'DMI ADX Smooth' },

    // --- MFI ---
    { key: 'mfi_period', indicator: 'mfi', defaultStr: '14', defaultNum: 14, label: 'MFI Period' },

    // --- SMI (Pine Script default: 14/3/3) ---
    { key: 'smi_long_len', indicator: 'smi', defaultStr: '14', defaultNum: 14, label: 'SMI Long Len' },
    { key: 'smi_short_len', indicator: 'smi', defaultStr: '3', defaultNum: 3, label: 'SMI Short Len' },
    { key: 'smi_sig_len', indicator: 'smi', defaultStr: '3', defaultNum: 3, label: 'SMI Signal Len' },

    // --- RSI ---
    { key: 'rsi_len', indicator: 'rsi', defaultStr: '14', defaultNum: 14, label: 'RSI Len' },
    { key: 'rsi_ma_len', indicator: 'rsi', defaultStr: '14', defaultNum: 14, label: 'RSI MA Len' },

    // --- CCI ---
    { key: 'cci_len', indicator: 'cci', defaultStr: '20', defaultNum: 20, label: 'CCI Len' },
    { key: 'cci_ma_len', indicator: 'cci', defaultStr: '14', defaultNum: 14, label: 'CCI MA Len' },

    // --- WPR ---
    { key: 'wpr_len', indicator: 'wpr', defaultStr: '14', defaultNum: 14, label: 'WPR Len' },

    // --- DI (Demand Index) ---
    { key: 'di_len', indicator: 'di', defaultStr: '10', defaultNum: 10, label: 'DI Len' },
    { key: 'di_smooth', indicator: 'di', defaultStr: '10', defaultNum: 10, label: 'DI Smooth' },
    { key: 'di_k', indicator: 'di', defaultStr: '2', defaultNum: 2, label: 'DI K' },

    // --- CMF ---
    { key: 'cmf_len', indicator: 'cmf', defaultStr: '20', defaultNum: 20, label: 'CMF Len' },

    // --- AD ---
    { key: 'ad_len', indicator: 'ad', defaultStr: '21', defaultNum: 21, label: 'AD SMA Len' },

    // --- MADR ---
    { key: 'madr_len', indicator: 'madr', defaultStr: '21', defaultNum: 21, label: 'MADR Len' },

    // --- ALMA ---
    { key: 'alma_len', indicator: 'alma', defaultStr: '9', defaultNum: 9, label: 'ALMA Len' },
    { key: 'alma_offset', indicator: 'alma', defaultStr: '0.85', defaultNum: 0.85, label: 'ALMA Offset' },
    { key: 'alma_sigma', indicator: 'alma', defaultStr: '6', defaultNum: 6, label: 'ALMA Sigma' },
    { key: 'alma_color', indicator: 'alma', defaultStr: '#fbbf24', defaultNum: 0, label: 'ALMA Color' },
    { key: 'alma_opacity', indicator: 'alma', defaultStr: '100', defaultNum: 100, label: 'ALMA Opacity' },
    { key: 'alma_width', indicator: 'alma', defaultStr: '2', defaultNum: 2, label: 'ALMA Width' },
    { key: 'alma_style', indicator: 'alma', defaultStr: '0', defaultNum: 0, label: 'ALMA Style' },

    // --- Bollinger Bands ---
    { key: 'bb_len', indicator: 'bb', defaultStr: '20', defaultNum: 20, label: 'BB Len' },
    { key: 'bb_stddev', indicator: 'bb', defaultStr: '2', defaultNum: 2, label: 'BB StdDev' },
    { key: 'bb_offset', indicator: 'bb', defaultStr: '0', defaultNum: 0, label: 'BB Offset' },
    { key: 'bb_color', indicator: 'bb', defaultStr: '#3b82f6', defaultNum: 0, label: 'BB Color' },
    { key: 'bb_opacity', indicator: 'bb', defaultStr: '100', defaultNum: 100, label: 'BB Opacity' },
    { key: 'bb_width', indicator: 'bb', defaultStr: '1', defaultNum: 1, label: 'BB Width' },
];

/** Look up a param definition by key */
export function getParam(key: string): IndicatorParamDef | undefined {
    return INDICATOR_PARAMS.find((p) => p.key === key);
}

/** Get all params for a specific indicator */
export function getParamsForIndicator(indicator: string): IndicatorParamDef[] {
    return INDICATOR_PARAMS.filter((p) => p.indicator === indicator);
}

/** Build a Record<string, string> of param key → defaultStr for quick lookup */
export const PARAM_DEFAULTS_STR: Record<string, string> = Object.fromEntries(
    INDICATOR_PARAMS.map((p) => [p.key, p.defaultStr])
);

/** Build a Record<string, number> of param key → defaultNum for quick lookup */
export const PARAM_DEFAULTS_NUM: Record<string, number> = Object.fromEntries(
    INDICATOR_PARAMS.map((p) => [p.key, p.defaultNum])
);

/**
 * Extract all indicator parameters from URL search params into a typed object.
 * Uses INDICATOR_PARAMS registry as single source of truth.
 * Applies optional JSON overrides from discovered strategies (p= param).
 */
export function extractIndicatorParams(
    search: Record<string, string | undefined>,
): Record<string, number | string> {
    const params: Record<string, number | string> = {};
    for (const paramDef of INDICATOR_PARAMS) {
        const raw = search[paramDef.key];
        if (paramDef.key.endsWith('_color') || paramDef.key.endsWith('_style')) {
            // String/display params
            params[paramDef.key] = raw || paramDef.defaultStr;
        } else {
            // Numeric params (int or float)
            params[paramDef.key] = raw !== undefined ? Number(raw) || paramDef.defaultNum : paramDef.defaultNum;
        }
    }
    return params;
}
