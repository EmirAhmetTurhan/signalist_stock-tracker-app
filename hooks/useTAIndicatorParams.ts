'use client';

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

export function useTAIndicatorParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // --- MACD ---
  const [macdFast, setMacdFast] = useState(searchParams.get('macd_fast') || '12');
  const [macdSlow, setMacdSlow] = useState(searchParams.get('macd_slow') || '26');
  const [macdSignal, setMacdSignal] = useState(searchParams.get('macd_sig') || '9');

  // --- StochRSI ---
  const [stochRsiLen, setStochRsiLen] = useState(searchParams.get('stoch_rsi_len') || '14');
  const [stochLen, setStochLen] = useState(searchParams.get('stoch_len') || '14');
  const [stochK, setStochK] = useState(searchParams.get('stoch_k') || '3');
  const [stochD, setStochD] = useState(searchParams.get('stoch_d') || '3');

  // --- WaveTrend ---
  const [wtAvgLen, setWtAvgLen] = useState(Number(searchParams.get('wt_avg_len')) || 10);
  const [wtChannelLen, setWtChannelLen] = useState(Number(searchParams.get('wt_channel_len')) || 21);
  const [wtMaLen, setWtMaLen] = useState(Number(searchParams.get('wt_ma_len')) || 4);

  // --- DMI ---
  const [dmiDiLen, setDmiDiLen] = useState(searchParams.get('dmi_di_len') || '14');
  const [dmiAdxSmooth, setDmiAdxSmooth] = useState(searchParams.get('dmi_adx_smooth') || '14');

  // --- MFI ---
  const [mfiPeriod, setMfiPeriod] = useState(searchParams.get('mfi_period') || '14');

  // --- SMI ---
  const [smiLongLen, setSmiLongLen] = useState(searchParams.get('smi_long_len') || '20');
  const [smiShortLen, setSmiShortLen] = useState(searchParams.get('smi_short_len') || '5');
  const [smiSigLen, setSmiSigLen] = useState(searchParams.get('smi_sig_len') || '5');

  // --- RSI ---
  const [rsiLen, setRsiLen] = useState(searchParams.get('rsi_len') || '14');
  const [rsiMaLen, setRsiMaLen] = useState(searchParams.get('rsi_ma_len') || '14');

  // --- CCI ---
  const [cciLen, setCciLen] = useState(searchParams.get('cci_len') || '20');
  const [cciMaLen, setCciMaLen] = useState(searchParams.get('cci_ma_len') || '14');

  // --- WPR ---
  const [wprLen, setWprLen] = useState(searchParams.get('wpr_len') || '14');

  // --- DI ---
  const [diLen, setDiLen] = useState(searchParams.get('di_len') || '10');
  const [diSmooth, setDiSmooth] = useState(searchParams.get('di_smooth') || '10');
  const [diK, setDiK] = useState(searchParams.get('di_k') || '2');

  // --- CMF ---
  const [cmfLen, setCmfLen] = useState(searchParams.get('cmf_len') || '20');

  // --- MADR ---
  const [madrLen, setMadrLen] = useState(searchParams.get('madr_len') || '21');

  // --- ALMA ---
  const [almaLen, setAlmaLen] = useState(searchParams.get('alma_len') || '9');
  const [almaOffset, setAlmaOffset] = useState(searchParams.get('alma_offset') || '0.85');
  const [almaSigma, setAlmaSigma] = useState(searchParams.get('alma_sigma') || '6');
  const [almaColor, setAlmaColor] = useState(searchParams.get('alma_color') || '#fbbf24');
  const [almaOpacity, setAlmaOpacity] = useState(searchParams.get('alma_opacity') || '100');
  const [almaWidth, setAlmaWidth] = useState(searchParams.get('alma_width') || '2');
  const [almaLineStyle, setAlmaLineStyle] = useState(searchParams.get('alma_style') || '0');
  const [almaTab, setAlmaTab] = useState('inputs');

  // --- Bollinger ---
  const [bbLen, setBbLen] = useState(searchParams.get('bb_len') || '20');
  const [bbStdDev, setBbStdDev] = useState(searchParams.get('bb_stddev') || '2');
  const [bbOffset, setBbOffset] = useState(searchParams.get('bb_offset') || '0');
  const [bbColor, setBbColor] = useState(searchParams.get('bb_color') || '#3b82f6');
  const [bbOpacity, setBbOpacity] = useState(searchParams.get('bb_opacity') || '100');
  const [bbWidth, setBbWidth] = useState(searchParams.get('bb_width') || '1');
  const [bbTab, setBbTab] = useState('inputs');

  // Hangi indikatörler aktif?
  const indParam = searchParams.get('ind') || '';
  const indicators = new Set(indParam.split(',').filter(Boolean));

  const show = {
    macd: indicators.has('macd'),
    stochrsi: indicators.has('stochrsi'),
    wavetrend: indicators.has('wavetrend'),
    dmi: indicators.has('dmi'),
    mfi: indicators.has('mfi'),
    smi: indicators.has('smi'),
    rsi: indicators.has('rsi'),
    cci: indicators.has('cci'),
    wpr: indicators.has('wpr'),
    di: indicators.has('di'),
    cmf: indicators.has('cmf'),
    madr: indicators.has('madr'),
    alma: indicators.has('alma'),
    bb: indicators.has('bb'),
  };

  const anyActive = Object.values(show).some(Boolean);

  const handleSave = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());

    const setParam = (key: string, value: string, defaultVal: string) => {
      if (value !== defaultVal) params.set(key, value);
      else params.delete(key);
    };

    if (show.macd) {
      setParam('macd_fast', macdFast, '12');
      setParam('macd_slow', macdSlow, '26');
      setParam('macd_sig', macdSignal, '9');
    } else {
      ['macd_fast', 'macd_slow', 'macd_sig'].forEach((k) => params.delete(k));
    }

    if (show.stochrsi) {
      setParam('stoch_rsi_len', stochRsiLen, '14');
      setParam('stoch_len', stochLen, '14');
      setParam('stoch_k', stochK, '3');
      setParam('stoch_d', stochD, '3');
    } else {
      ['stoch_rsi_len', 'stoch_len', 'stoch_k', 'stoch_d'].forEach((k) => params.delete(k));
    }

    if (show.wavetrend) {
      setParam('wt_avg_len', String(wtAvgLen), '10');
      setParam('wt_channel_len', String(wtChannelLen), '21');
      setParam('wt_ma_len', String(wtMaLen), '4');
    } else {
      ['wt_avg_len', 'wt_channel_len', 'wt_ma_len'].forEach((k) => params.delete(k));
    }

    if (show.dmi) {
      setParam('dmi_di_len', dmiDiLen, '14');
      setParam('dmi_adx_smooth', dmiAdxSmooth, '14');
    } else {
      ['dmi_di_len', 'dmi_adx_smooth'].forEach((k) => params.delete(k));
    }

    if (show.mfi) {
      setParam('mfi_period', mfiPeriod, '14');
    } else {
      params.delete('mfi_period');
    }

    if (show.smi) {
      setParam('smi_long_len', smiLongLen, '20');
      setParam('smi_short_len', smiShortLen, '5');
      setParam('smi_sig_len', smiSigLen, '5');
    } else {
      ['smi_long_len', 'smi_short_len', 'smi_sig_len'].forEach((k) => params.delete(k));
    }

    if (show.rsi) {
      setParam('rsi_len', rsiLen, '14');
      setParam('rsi_ma_len', rsiMaLen, '14');
    } else {
      ['rsi_len', 'rsi_ma_len'].forEach((k) => params.delete(k));
    }

    if (show.cci) {
      setParam('cci_len', cciLen, '20');
      setParam('cci_ma_len', cciMaLen, '14');
    } else {
      ['cci_len', 'cci_ma_len'].forEach((k) => params.delete(k));
    }

    if (show.wpr) {
      setParam('wpr_len', wprLen, '14');
    } else {
      params.delete('wpr_len');
    }

    if (show.di) {
      setParam('di_len', diLen, '10');
      setParam('di_smooth', diSmooth, '10');
      setParam('di_k', diK, '2');
    } else {
      ['di_len', 'di_smooth', 'di_k'].forEach((k) => params.delete(k));
    }

    if (show.cmf) {
      setParam('cmf_len', cmfLen, '20');
    } else {
      params.delete('cmf_len');
    }

    if (show.madr) {
      setParam('madr_len', madrLen, '21');
    } else {
      params.delete('madr_len');
    }

    if (show.alma) {
      setParam('alma_len', almaLen, '9');
      setParam('alma_offset', almaOffset, '0.85');
      setParam('alma_sigma', almaSigma, '6');
      setParam('alma_color', almaColor, '#fbbf24');
      setParam('alma_opacity', almaOpacity, '100');
      setParam('alma_width', almaWidth, '2');
      setParam('alma_style', almaLineStyle, '0');
    } else {
      ['alma_len', 'alma_offset', 'alma_sigma', 'alma_color', 'alma_opacity', 'alma_width', 'alma_style'].forEach((k) => params.delete(k));
    }

    if (show.bb) {
      setParam('bb_len', bbLen, '20');
      setParam('bb_stddev', bbStdDev, '2');
      setParam('bb_offset', bbOffset, '0');
      setParam('bb_color', bbColor, '#3b82f6');
      setParam('bb_opacity', bbOpacity, '100');
      setParam('bb_width', bbWidth, '1');
    } else {
      ['bb_len', 'bb_stddev', 'bb_offset', 'bb_color', 'bb_opacity', 'bb_width'].forEach((k) => params.delete(k));
    }

    router.replace(`${pathname}?${params.toString()}`);
    router.refresh();
  }, [searchParams, pathname, router, show,
    macdFast, macdSlow, macdSignal,
    stochRsiLen, stochLen, stochK, stochD,
    wtAvgLen, wtChannelLen, wtMaLen,
    dmiDiLen, dmiAdxSmooth,
    mfiPeriod,
    smiLongLen, smiShortLen, smiSigLen,
    rsiLen, rsiMaLen,
    cciLen, cciMaLen,
    wprLen,
    diLen, diSmooth, diK,
    cmfLen,
    madrLen,
    almaLen, almaOffset, almaSigma, almaColor, almaOpacity, almaWidth, almaLineStyle,
    bbLen, bbStdDev, bbOffset, bbColor, bbOpacity, bbWidth,
  ]);

  return {
    // state
    macdFast, setMacdFast, macdSlow, setMacdSlow, macdSignal, setMacdSignal,
    stochRsiLen, setStochRsiLen, stochLen, setStochLen, stochK, setStochK, stochD, setStochD,
    wtAvgLen, setWtAvgLen, wtChannelLen, setWtChannelLen, wtMaLen, setWtMaLen,
    dmiDiLen, setDmiDiLen, dmiAdxSmooth, setDmiAdxSmooth,
    mfiPeriod, setMfiPeriod,
    smiLongLen, setSmiLongLen, smiShortLen, setSmiShortLen, smiSigLen, setSmiSigLen,
    rsiLen, setRsiLen, rsiMaLen, setRsiMaLen,
    cciLen, setCciLen, cciMaLen, setCciMaLen,
    wprLen, setWprLen,
    diLen, setDiLen, diSmooth, setDiSmooth, diK, setDiK,
    cmfLen, setCmfLen,
    madrLen, setMadrLen,
    almaLen, setAlmaLen, almaOffset, setAlmaOffset, almaSigma, setAlmaSigma,
    almaColor, setAlmaColor, almaOpacity, setAlmaOpacity, almaWidth, setAlmaWidth, almaLineStyle, setAlmaLineStyle,
    almaTab, setAlmaTab,
    bbLen, setBbLen, bbStdDev, setBbStdDev, bbOffset, setBbOffset,
    bbColor, setBbColor, bbOpacity, setBbOpacity, bbWidth, setBbWidth,
    bbTab, setBbTab,
    // derived
    show, anyActive,
    // action
    handleSave,
  };
}
