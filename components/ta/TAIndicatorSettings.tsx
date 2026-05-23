'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings2 } from 'lucide-react';
import { useTAIndicatorParams } from '@/hooks/useTAIndicatorParams';

// ---- Küçük yardımcı: etiketli input alanı ----
function ParamInput({
  label,
  value,
  onChange,
  type = 'number',
  min,
  className,
}: {
  label: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  min?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs text-gray-400">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={onChange}
        className="bg-[#0f0f0f] border-gray-600 h-8"
        min={min}
      />
    </div>
  );
}

// ---- Section sarmalayıcı ----
function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3 border-b border-gray-700 pb-4">
      <h4 className="font-medium text-yellow-500">{title}</h4>
      {children}
    </div>
  );
}

// ---- MACD Ayarları ----
function MacdSettings({ fast, setFast, slow, setSlow, signal, setSignal }: any) {
  return (
    <SettingsSection title="MACD">
      <div className="grid grid-cols-3 gap-2">
        <ParamInput label="Fast Length" value={fast} onChange={(e) => setFast(e.target.value)} />
        <ParamInput label="Slow Length" value={slow} onChange={(e) => setSlow(e.target.value)} />
        <ParamInput label="Signal" value={signal} onChange={(e) => setSignal(e.target.value)} />
      </div>
    </SettingsSection>
  );
}

// ---- StochRSI Ayarları ----
function StochRSISettings({ rsiLen, setRsiLen, stochLen, setStochLen, k, setK, d, setD }: any) {
  return (
    <SettingsSection title="Stochastic RSI">
      <div className="grid grid-cols-4 gap-2">
        <ParamInput label="RSI Len" value={rsiLen} onChange={(e) => setRsiLen(e.target.value)} />
        <ParamInput label="Stoch Len" value={stochLen} onChange={(e) => setStochLen(e.target.value)} />
        <ParamInput label="K" value={k} onChange={(e) => setK(e.target.value)} />
        <ParamInput label="D" value={d} onChange={(e) => setD(e.target.value)} />
      </div>
    </SettingsSection>
  );
}

// ---- RSI Ayarları ----
function RsiSettings({ len, setLen, maLen, setMaLen }: any) {
  return (
    <SettingsSection title="RSI">
      <div className="grid grid-cols-2 gap-4">
        <ParamInput label="Length" value={len} onChange={(e) => setLen(e.target.value)} />
        <ParamInput label="MA Length" value={maLen} onChange={(e) => setMaLen(e.target.value)} />
      </div>
    </SettingsSection>
  );
}

// ---- ALMA Ayarları (Inputs + Style sekmeli) ----
function AlmaSettings(props: any) {
  const { almaLen, setAlmaLen, almaOffset, setAlmaOffset, almaSigma, setAlmaSigma,
    almaColor, setAlmaColor, almaOpacity, setAlmaOpacity, almaWidth, setAlmaWidth,
    almaLineStyle, setAlmaLineStyle, almaTab, setAlmaTab } = props;
  return (
    <SettingsSection title="ALMA">
      <div className="flex gap-1 border-b border-gray-800 mb-2">
        <button
          type="button"
          className={`text-xs px-2 pb-1 ${almaTab === 'inputs' ? 'text-yellow-500 border-b border-yellow-500' : 'text-gray-500'}`}
          onClick={() => setAlmaTab('inputs')}
        >
          Inputs
        </button>
        <button
          type="button"
          className={`text-xs px-2 pb-1 ${almaTab === 'style' ? 'text-yellow-500 border-b border-yellow-500' : 'text-gray-500'}`}
          onClick={() => setAlmaTab('style')}
        >
          Style
        </button>
      </div>
      {almaTab === 'inputs' ? (
        <div className="grid grid-cols-3 gap-2">
          <ParamInput label="Length (9)" value={almaLen} onChange={(e) => setAlmaLen(e.target.value)} />
          <ParamInput label="Offset (0.85)" value={almaOffset} onChange={(e) => setAlmaOffset(e.target.value)} />
          <ParamInput label="Sigma (6)" value={almaSigma} onChange={(e) => setAlmaSigma(e.target.value)} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <ParamInput label="Color" value={almaColor} onChange={(e) => setAlmaColor(e.target.value)} type="text" />
          <ParamInput label="Opacity %" value={almaOpacity} onChange={(e) => setAlmaOpacity(e.target.value)} />
          <ParamInput label="Width" value={almaWidth} onChange={(e) => setAlmaWidth(e.target.value)} />
          <div>
            <Label className="text-xs text-gray-400">Line Style</Label>
            <select
              value={almaLineStyle}
              onChange={(e) => setAlmaLineStyle(e.target.value)}
              className="w-full bg-[#0f0f0f] border border-gray-600 h-8 rounded text-xs text-gray-200"
            >
              <option value="0">Solid</option>
              <option value="1">Dotted</option>
              <option value="2">Dashed</option>
            </select>
          </div>
        </div>
      )}
    </SettingsSection>
  );
}

// ---- Bollinger Ayarları (Inputs + Style sekmeli) ----
function BollingerSettings(props: any) {
  const { bbLen, setBbLen, bbStdDev, setBbStdDev, bbOffset, setBbOffset,
    bbColor, setBbColor, bbOpacity, setBbOpacity, bbWidth, setBbWidth, bbTab, setBbTab } = props;
  return (
    <SettingsSection title="Bollinger Bands">
      <div className="flex gap-1 border-b border-gray-800 mb-2">
        <button
          type="button"
          className={`text-xs px-2 pb-1 ${bbTab === 'inputs' ? 'text-yellow-500 border-b border-yellow-500' : 'text-gray-500'}`}
          onClick={() => setBbTab('inputs')}
        >
          Inputs
        </button>
        <button
          type="button"
          className={`text-xs px-2 pb-1 ${bbTab === 'style' ? 'text-yellow-500 border-b border-yellow-500' : 'text-gray-500'}`}
          onClick={() => setBbTab('style')}
        >
          Style
        </button>
      </div>
      {bbTab === 'inputs' ? (
        <div className="grid grid-cols-3 gap-2">
          <ParamInput label="Length (20)" value={bbLen} onChange={(e) => setBbLen(e.target.value)} />
          <ParamInput label="StdDev (2)" value={bbStdDev} onChange={(e) => setBbStdDev(e.target.value)} />
          <ParamInput label="Offset (0)" value={bbOffset} onChange={(e) => setBbOffset(e.target.value)} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <ParamInput label="Color" value={bbColor} onChange={(e) => setBbColor(e.target.value)} type="text" />
          <ParamInput label="Opacity %" value={bbOpacity} onChange={(e) => setBbOpacity(e.target.value)} />
          <ParamInput label="Width" value={bbWidth} onChange={(e) => setBbWidth(e.target.value)} />
        </div>
      )}
    </SettingsSection>
  );
}

export default function TAIndicatorSettings() {
  const [open, setOpen] = useState(false);
  const p = useTAIndicatorParams();

  if (!p.anyActive) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="shrink-0" title="Indicator Settings">
          <Settings2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-[#141414] border-gray-700 text-gray-100">
        <DialogHeader>
          <DialogTitle>Indicator Settings</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {p.show.macd && <MacdSettings fast={p.macdFast} setFast={p.setMacdFast} slow={p.macdSlow} setSlow={p.setMacdSlow} signal={p.macdSignal} setSignal={p.setMacdSignal} />}
          {p.show.stochrsi && <StochRSISettings rsiLen={p.stochRsiLen} setRsiLen={p.setStochRsiLen} stochLen={p.stochLen} setStochLen={p.setStochLen} k={p.stochK} setK={p.setStochK} d={p.stochD} setD={p.setStochD} />}
          {p.show.rsi && <RsiSettings len={p.rsiLen} setLen={p.setRsiLen} maLen={p.rsiMaLen} setMaLen={p.setRsiMaLen} />}

          {p.show.wavetrend && (
            <SettingsSection title="WaveTrend">
              <div className="grid grid-cols-3 gap-2">
                <ParamInput label="Avg Len (10)" value={p.wtAvgLen} onChange={(e) => p.setWtAvgLen(Number(e.target.value))} min={1} />
                <ParamInput label="Channel Len (21)" value={p.wtChannelLen} onChange={(e) => p.setWtChannelLen(Number(e.target.value))} min={1} />
                <ParamInput label="MA Len (4)" value={p.wtMaLen} onChange={(e) => p.setWtMaLen(Number(e.target.value))} min={1} />
              </div>
            </SettingsSection>
          )}

          {p.show.dmi && (
            <SettingsSection title="Directional Movement Index">
              <div className="grid grid-cols-2 gap-4">
                <ParamInput label="DI Length" value={p.dmiDiLen} onChange={(e) => p.setDmiDiLen(e.target.value)} min={1} />
                <ParamInput label="ADX Smoothing" value={p.dmiAdxSmooth} onChange={(e) => p.setDmiAdxSmooth(e.target.value)} min={1} />
              </div>
            </SettingsSection>
          )}

          {p.show.mfi && (
            <SettingsSection title="Money Flow Index">
              <ParamInput label="Period (14)" value={p.mfiPeriod} onChange={(e) => p.setMfiPeriod(e.target.value)} min={1} />
            </SettingsSection>
          )}

          {p.show.smi && (
            <SettingsSection title="SMI Ergodic Indicator">
              <div className="grid grid-cols-3 gap-2">
                <ParamInput label="Long Len (20)" value={p.smiLongLen} onChange={(e) => p.setSmiLongLen(e.target.value)} min={1} />
                <ParamInput label="Short Len (5)" value={p.smiShortLen} onChange={(e) => p.setSmiShortLen(e.target.value)} min={1} />
                <ParamInput label="Signal Len (5)" value={p.smiSigLen} onChange={(e) => p.setSmiSigLen(e.target.value)} min={1} />
              </div>
            </SettingsSection>
          )}

          {p.show.cci && (
            <SettingsSection title="Commodity Channel Index">
              <div className="grid grid-cols-2 gap-4">
                <ParamInput label="Length (20)" value={p.cciLen} onChange={(e) => p.setCciLen(e.target.value)} />
                <ParamInput label="MA Length (14)" value={p.cciMaLen} onChange={(e) => p.setCciMaLen(e.target.value)} />
              </div>
            </SettingsSection>
          )}

          {p.show.wpr && (
            <SettingsSection title="Williams %R">
              <ParamInput label="Length (14)" value={p.wprLen} onChange={(e) => p.setWprLen(e.target.value)} />
            </SettingsSection>
          )}

          {p.show.di && (
            <SettingsSection title="Demand Index">
              <div className="grid grid-cols-3 gap-2">
                <ParamInput label="Length (10)" value={p.diLen} onChange={(e) => p.setDiLen(e.target.value)} />
                <ParamInput label="Smooth (10)" value={p.diSmooth} onChange={(e) => p.setDiSmooth(e.target.value)} />
                <ParamInput label="K Factor (2)" value={p.diK} onChange={(e) => p.setDiK(e.target.value)} />
              </div>
            </SettingsSection>
          )}

          {p.show.cmf && (
            <SettingsSection title="Chaikin Money Flow">
              <ParamInput label="Length (20)" value={p.cmfLen} onChange={(e) => p.setCmfLen(e.target.value)} />
            </SettingsSection>
          )}

          {p.show.madr && (
            <SettingsSection title="Moving Average Deviation Rate">
              <ParamInput label="Length (21)" value={p.madrLen} onChange={(e) => p.setMadrLen(e.target.value)} />
            </SettingsSection>
          )}

          {p.show.alma && <AlmaSettings {...p} />}
          {p.show.bb && <BollingerSettings {...p} />}
        </div>

        <DialogFooter>
          <Button
            onClick={() => { p.handleSave(); setOpen(false); }}
            className="w-full bg-yellow-500 text-black hover:bg-yellow-400"
          >
            Save & Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
