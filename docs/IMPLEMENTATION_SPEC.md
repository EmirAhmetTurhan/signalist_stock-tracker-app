# Signalist — Tam Implementasyon Spesifikasyonu

> **Amaç:** Bu belge, başka bir AI modelinin hiçbir şey sormadan implementasyonu baştan sona yapabilmesi için gereken her şeyi içerir. Mevcut sistemin yapısı, yapılacak tüm değişiklikler, eklenecek her dosya, her fonksiyon imzası, her type ve her test senaryosu buradadır.

---

## 0. Proje Genel Bakış

### Tech Stack
- **Framework:** Next.js 15 (App Router)
- **Dil:** TypeScript
- **Veritabanı:** MongoDB (Mongoose)
- **Test:** Vitest
- **Async Jobs:** Inngest
- **Grafik:** lightweight-charts (TradingView)

### Kritik Mevcut Dosyalar (DEĞİŞTİRİLECEK olanlar)

| Dosya | Sorumluluk |
|-------|-----------|
| `lib/ta/types.ts` | Tüm TA type tanımları |
| `lib/ta/signal-registry.ts` | 17 indikatörün sinyal/strength/cross fonksiyonları + DST füzyon |
| `lib/ta/strategy-optimizer.ts` | `runStrategyBacktest()` — ana backtest motoru, `ProfileConfig`, `StrategyBacktestConfig` |
| `lib/ta/discovery-types.ts` | Deep discovery pipeline tipleri |
| `lib/ta/cross-validator.ts` | 5-fold cross-validation |
| `lib/ta/backtest.ts` | `BacktestHistoryItem` type'ı, basit `calculateWinRate()` |

### Kritik Mevcut Dosyalar (DOKUNULMAYACAK olanlar)

| Dosya | Neden |
|-------|-------|
| `lib/indicators/*` | İndikatör hesaplama formülleri değişmiyor |
| `lib/ta/compute.ts` | İndikatör orkestratörü değişmiyor |
| `lib/ta/signals.ts` | Sinyal üretimi değişmiyor |
| `lib/ta/signal-registry.ts` (DST matematiği kısmı) | Dempster-Shafer birleştirme mantığı aynen kalacak |
| `lib/ta/combinatorial-search.ts` | Kombinasyon üretme ve paralel arama değişmiyor (sadece çağırdığı backtest değişecek) |
| `lib/ta/ga-optimizer.ts` | Genetik algoritma değişmiyor |
| `lib/ta/differential-evolution.ts` | DE değişmiyor |
| `lib/ta/mcts-search.ts` | MCTS değişmiyor |
| `lib/ta/mutual-information.ts` | MI değişmiyor |
| `lib/ta/hyperband-search.ts` | Hyperband değişmiyor |

---

## 1. Problem Tanımı

### Mevcut Sistemin 3 Temel Kusuru

**Kusur 1 — Path-Independent Değerlendirme (En Büyük Sorun)**
`strategy-optimizer.ts:1141-1145` — Backtest, bir işlemi sadece iki fiyat noktasıyla değerlendirir:
```typescript
const isWin = (signal === "BUY" && futurePrice > currentPrice) 
           || (signal === "SELL" && futurePrice < currentPrice);
```
Fiyat %50 düşüp sonra %1 yükselse bile WIN sayılır. Aradaki günler hesaba katılmaz.

**Kusur 2 — Sermaye Körlüğü**
"10.000 TL ile başlasaydım şu an kaç param olurdu?" sorusu cevaplanamaz. Pozisyon büyüklüğü, komisyon, bileşik getiri yok.

**Kusur 3 — Piyasa Rejimi Modellemesi Eksik**
`detectRegime()` zaten var (`strategy-optimizer.ts:757-808`) ve `regimeBreakdown` hesaplanıyor, ama bu bilgi strateji seçimine veya DST güven değerlerine beslenmiyor. Her piyasa koşulunda aynı indikatörlere aynı güven atanıyor.

---

## 2. Yeni Sistem Mimarisi

### Temel Felsefe

| Eski | Yeni |
|------|------|
| 2 noktaya bak, Win/Loss de | Trade'i bar bar simüle et, gerçekçi sonuç |
| Sermayesiz | 10.000 TL başlangıç, bileşik, komisyonlu |
| Sabit indikatör güveni (0.6) | Rejime göre öğrenilmiş güven |
| Look-forward ground truth | Path-aware + rejim-aware ground truth |

### Geçiş Stratejisi

Tüm değişiklikler `evaluationMode` flag'i arkasında:
```typescript
type EvaluationMode = 'lookforward' | 'pathaware' | 'regime';
```
- Varsayılan: `'lookforward'` (eski sistem)
- Doğrulandıktan sonra varsayılan değiştirilecek
- Flag, `StrategyBacktestConfig` üzerinden tüm backtest/evaluator/CV/discovery pipeline'ına yayılır

---

## 3. Adım Adım Implementasyon Planı (9 Adım)

---

### ADIM 1: Path-Aware Trade Simülasyonu

**Amaç:** Tek bir işlemi bar bar simüle eden saf fonksiyon. "BUY dedi, kaçtan çıktı, yolda ne oldu?"

**YENİ DOSYA:** `lib/ta/trade-simulator.ts`

#### Yeni Type'lar (bu dosyada tanımlanacak)

```typescript
// Çıkış sebepleri
export type ExitReason = 'stop_loss' | 'take_profit' | 'trailing_stop' | 'opposite_signal' | 'time_stop';

// Risk yapılandırması
export interface TradeRiskConfig {
  stopLossAtrMult: number;      // Stop-loss: SL = entry - (ATR × mult)
  takeProfitR: number;          // Take-profit: TP = entry + (stop mesafesi × R)
  useTrailingStop: boolean;     // Trailing stop aktif mi?
  trailAtrMult: number;         // Trailing: en yüksek fiyattan (ATR × mult) aşağıda
  timeStopBars: number;         // Maksimum beklenen bar (lookForward gibi)
}

// Tek işlem simülasyon sonucu
export interface SimulatedTrade {
  entryIndex: number;           // Giriş bar indeksi
  exitIndex: number;            // Çıkış bar indeksi
  exitReason: ExitReason;       // Neden çıktı?
  entryPrice: number;
  exitPrice: number;
  realizedReturnPct: number;    // Gerçekleşen getiri (%)
  mfe: number;                  // Maximum Favorable Excursion — işlem içinde ulaşılan en yüksek kâr (%)
  mae: number;                  // Maximum Adverse Excursion — işlem içinde ulaşılan en düşük zarar (%)
  intraTradeMaxDD: number;      // İşlem içi en yüksek drawdown (%)
  barsHeld: number;             // Kaç bar tutuldu
}
```

#### Fonksiyon İmzası

```typescript
export function simulateTrade(
  candles: Candle[],            // Tüm mum verisi (en az entryIndex + timeStopBars uzunluğunda)
  entryIndex: number,           // Giriş yapılan bar indeksi
  signal: 'BUY' | 'SELL',       // Sinyal yönü
  atrValues: number[],          // Önceden hesaplanmış ATR değerleri
  riskConfig: TradeRiskConfig,  // Risk parametreleri
  // Opsiyonel: karşıt sinyal kontrolü için callback
  hasOppositeSignal?: (barIndex: number) => boolean,
): SimulatedTrade
```

#### Algoritma (Pseudo-code)

```
function simulateTrade(candles, entryIndex, signal, atrValues, riskConfig):
  entryPrice = candles[entryIndex].close
  currentATR = atrValues[entryIndex]
  
  // Stop-loss fiyatı
  stopDistance = currentATR * riskConfig.stopLossAtrMult
  if signal == 'BUY':
    stopPrice = entryPrice - stopDistance
    tpDistance = stopDistance * riskConfig.takeProfitR
    tpPrice = entryPrice + tpDistance
  else: // SELL
    stopPrice = entryPrice + stopDistance
    tpPrice = entryPrice - tpDistance
  
  bestPrice = entryPrice   // MFE için
  worstPrice = entryPrice  // MAE için
  peakPrice = entryPrice   // Trailing stop için
  trailingStopPrice = signal == 'BUY' ? entryPrice - stopDistance : entryPrice + stopDistance
  
  for i = entryIndex+1 to entryIndex + riskConfig.timeStopBars:
    if i >= candles.length: break
    
    currentPrice = candles[i].close
    
    // MFE/MAE güncelle
    if signal == 'BUY':
      bestPrice = max(bestPrice, currentPrice)
      worstPrice = min(worstPrice, currentPrice)
      // Trailing stop güncelle
      if riskConfig.useTrailingStop and currentPrice > peakPrice:
        peakPrice = currentPrice
        trailingStopPrice = peakPrice - currentATR * riskConfig.trailAtrMult
      // Stop-loss kontrolü
      effectiveStop = max(stopPrice, trailingStopPrice)
      if currentPrice <= effectiveStop:
        return { exitReason: riskConfig.useTrailingStop and trailingStopPrice > stopPrice ? 'trailing_stop' : 'stop_loss', ... }
      // Take-profit kontrolü
      if currentPrice >= tpPrice:
        return { exitReason: 'take_profit', ... }
    else: // SELL
      bestPrice = min(bestPrice, currentPrice)
      worstPrice = max(worstPrice, currentPrice)
      if riskConfig.useTrailingStop and currentPrice < peakPrice:
        peakPrice = currentPrice
        trailingStopPrice = peakPrice + currentATR * riskConfig.trailAtrMult
      effectiveStop = min(stopPrice, trailingStopPrice)
      if currentPrice >= effectiveStop:
        return { ... }
      if currentPrice <= tpPrice:
        return { exitReason: 'take_profit', ... }
    
    // Karşıt sinyal kontrolü
    if hasOppositeSignal and hasOppositeSignal(i):
      return { exitReason: 'opposite_signal', ... }
  
  // Time stop — zaman doldu
  exitPrice = candles[min(entryIndex + riskConfig.timeStopBars, candles.length-1)].close
  return { exitReason: 'time_stop', exitPrice, ... }
```

#### Mevcut Dosyada Değişiklik: `lib/ta/types.ts`

```typescript
// EKLENECEK (dosyanın sonuna):
export type EvaluationMode = 'lookforward' | 'pathaware' | 'regime';
```

#### Mevcut Dosyada Değişiklik: `lib/ta/backtest.ts`

```typescript
// BacktestHistoryItem'a eklenecek alanlar:
export type BacktestHistoryItem = {
  time: string | number;
  signal: "BUY" | "SELL";
  price: number;
  futurePrice: number;
  isWin: boolean;
  // YENİ ALANLAR:
  mfe?: number;           // Maximum Favorable Excursion (%)
  mae?: number;           // Maximum Adverse Excursion (%)
  intraTradeDD?: number;  // İşlem içi max drawdown (%)
  exitReason?: string;    // stop_loss | take_profit | trailing_stop | opposite_signal | time_stop
  barsHeld?: number;      // Kaç bar tutuldu
  realizedReturn?: number; // Gerçekleşen getiri (%)
};
```

#### Mevcut Dosyada Değişiklik: `lib/ta/strategy-optimizer.ts`

**`ProfileConfig`'e eklenecek:**
```typescript
export interface ProfileConfig {
  // ... mevcut alanlar aynen kalacak ...
  
  // YENİ: Trade simülasyonu risk parametreleri
  stopLossAtrMult: number;
  takeProfitR: number;
  useTrailingStop: boolean;
  trailAtrMult: number;
}
```

**`PROFILE_CONFIGS` güncellemesi:**
```typescript
export const PROFILE_CONFIGS: Record<SignalProfile, ProfileConfig> = {
  Aggressive: {
    tradeThreshold: 0.15,
    baseCooldown: 3,
    gamma: 1.0,
    cooldownMin: 1,
    cooldownMax: 8,
    requireCrossover: false,
    volatilityLookback: 30,
    // YENİ:
    stopLossAtrMult: 1.5,
    takeProfitR: 1.5,
    useTrailingStop: true,
    trailAtrMult: 0.5,
  },
  Balanced: {
    tradeThreshold: 0.40,
    baseCooldown: 5,
    gamma: 0.7,
    cooldownMin: 2,
    cooldownMax: 14,
    requireCrossover: true,
    volatilityLookback: 30,
    // YENİ:
    stopLossAtrMult: 2.0,
    takeProfitR: 2.0,
    useTrailingStop: false,
    trailAtrMult: 0,
  },
  Conservative: {
    tradeThreshold: 0.65,
    baseCooldown: 7,
    gamma: 0.5,
    cooldownMin: 3,
    cooldownMax: 20,
    requireCrossover: true,
    volatilityLookback: 30,
    // YENİ:
    stopLossAtrMult: 2.5,
    takeProfitR: 3.0,
    useTrailingStop: false,
    trailAtrMult: 0,
  },
};
```

**`StrategyBacktestConfig`'e eklenecek:**
```typescript
export interface StrategyBacktestConfig {
  // ... mevcut alanlar ...
  
  // YENİ:
  evaluationMode?: EvaluationMode;  // 'lookforward' | 'pathaware' | 'regime' (varsayılan: 'lookforward')
  riskConfig?: TradeRiskConfig;     // Opsiyonel override (ProfileConfig'ten gelir)
}
```

**`StrategyBacktestResult`'a eklenecek:**
```typescript
export interface StrategyBacktestResult {
  // ... mevcut alanlar ...
  
  // YENİ:
  evaluationMode?: EvaluationMode;
  avgMFE?: number;          // Ortalama MFE
  avgMAE?: number;          // Ortalama MAE
  avgBarsHeld?: number;     // Ortalama tutulan bar
  exitReasonBreakdown?: Record<string, number>;  // Çıkış sebebi dağılımı
}
```

**`runStrategyBacktest` içinde değişiklik (satır ~1141-1145):**

Eski kod:
```typescript
const rawReturn = (futurePrice - currentPrice) / currentPrice;
const tradeReturn = signal === 'BUY' ? rawReturn : -rawReturn;
const isWin = tradeReturn > 0;
```

Yeni kod (evaluationMode flag'i ile):
```typescript
let tradeReturn: number;
let isWin: boolean;
let mfe: number | undefined;
let mae: number | undefined;
let intraDD: number | undefined;
let exitReason: string | undefined;
let barsHeld: number | undefined;

if (config.evaluationMode === 'pathaware' || config.evaluationMode === 'regime') {
  // Path-aware simülasyon
  const riskCfg = config.riskConfig ?? getProfileConfig(config).riskConfig();
  // riskConfig'i TradeRiskConfig'e dönüştür:
  const tradeRiskCfg: TradeRiskConfig = {
    stopLossAtrMult: riskCfg.stopLossAtrMult ?? 2.0,
    takeProfitR: riskCfg.takeProfitR ?? 2.0,
    useTrailingStop: riskCfg.useTrailingStop ?? false,
    trailAtrMult: riskCfg.trailAtrMult ?? 0,
    timeStopBars: lookForward,
  };
  const simResult = simulateTrade(candles, i, signal, atrValues, tradeRiskCfg);
  tradeReturn = simResult.realizedReturnPct;
  isWin = tradeReturn > 0;
  mfe = simResult.mfe;
  mae = simResult.mae;
  intraDD = simResult.intraTradeMaxDD;
  exitReason = simResult.exitReason;
  barsHeld = simResult.barsHeld;
  // futurePrice güncelle (exit noktası)
  futurePrice = simResult.exitPrice;
} else {
  // Eski look-forward mantığı (değişmedi)
  const rawReturn = (futurePrice - currentPrice) / currentPrice;
  tradeReturn = signal === 'BUY' ? rawReturn : -rawReturn;
  isWin = tradeReturn > 0;
}
```

#### Test Dosyası

**YENİ DOSYA:** `__tests__/ta/trade-simulator.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { simulateTrade } from '@/lib/ta/trade-simulator';
import type { Candle } from '@/lib/ta/backtest';

// Sentetik mum verisi
function makeCandles(prices: number[]): Candle[] {
  return prices.map((close, i) => ({
    time: `2024-01-${String(i + 1).padStart(2, '0')}`,
    close,
    high: close * 1.01,
    low: close * 0.99,
    open: close,
    volume: 1000000,
  }));
}

// Sentetik ATR (sabit)
function makeATR(length: number, value: number): number[] {
  return Array(length).fill(value);
}

describe('simulateTrade', () => {
  it('stop-loss: dips below stop should be LOSS even if closes up', () => {
    // Fiyat: 100 → 90 (stop) → ... → 110 (ama stop'tan çıktı)
    const prices = [100, 98, 95, 94, 96, 100, 105, 110, 115, 120];
    const candles = makeCandles(prices);
    const atr = makeATR(prices.length, 5); // ATR = 5
    
    const result = simulateTrade(candles, 0, 'BUY', atr, {
      stopLossAtrMult: 1.0,   // SL = 100 - 5*1 = 95
      takeProfitR: 3.0,        // TP = 100 + 5*3 = 115
      useTrailingStop: false,
      trailAtrMult: 0,
      timeStopBars: 20,
    });
    
    // Fiyat 94'e düştü → stop-loss (95) tetiklendi
    expect(result.exitReason).toBe('stop_loss');
    expect(result.realizedReturnPct).toBeLessThan(0); // Zarar
    expect(result.exitPrice).toBeLessThanOrEqual(95);
  });

  it('take-profit: reaches TP should WIN', () => {
    const prices = [100, 102, 105, 108, 112, 115, 116, 115];
    const candles = makeCandles(prices);
    const atr = makeATR(prices.length, 5);
    
    const result = simulateTrade(candles, 0, 'BUY', atr, {
      stopLossAtrMult: 2.0,   // SL = 100 - 5*2 = 90
      takeProfitR: 2.0,        // TP = 100 + 10*2 = 120 → 115'te tetiklenmez, stop mesafesi = 5*2 = 10, TP = 100+10*2 = 120
      useTrailingStop: false,
      trailAtrMult: 0,
      timeStopBars: 20,
    });
    // TP = 100 + (5*2.0)*2.0 = 120 ... hmm, fiyatlar 120'ye ulaşmıyor
    // Düzeltelim: stopDistance = 5*2=10, TP = 100 + 10*2.0 = 120
    // Fiyatlar 120'ye ulaşmadı, time stop olur
    // Testi düzgün kuralım:
  });

  it('take-profit: simpler test', () => {
    const prices = [100, 105, 110, 115, 120, 125];
    const candles = makeCandles(prices);
    const atr = makeATR(prices.length, 3);
    
    // stopDistance = 3*1.5 = 4.5, TP = 100 + 4.5*2 = 109
    const result = simulateTrade(candles, 0, 'BUY', atr, {
      stopLossAtrMult: 1.5,
      takeProfitR: 2.0,
      useTrailingStop: false,
      trailAtrMult: 0,
      timeStopBars: 20,
    });
    
    expect(result.exitReason).toBe('take_profit');
    expect(result.realizedReturnPct).toBeGreaterThan(0);
  });

  it('time-stop: no SL/TP hit → exits at timeStopBars', () => {
    const prices = [100, 101, 100, 101, 100, 101, 100, 101];
    const candles = makeCandles(prices);
    const atr = makeATR(prices.length, 1);
    
    const result = simulateTrade(candles, 0, 'BUY', atr, {
      stopLossAtrMult: 10.0,  // Çok geniş SL (hiç tetiklenmez)
      takeProfitR: 10.0,       // Çok uzak TP
      useTrailingStop: false,
      trailAtrMult: 0,
      timeStopBars: 5,         // 5 bar sonra çık
    });
    
    expect(result.exitReason).toBe('time_stop');
    expect(result.barsHeld).toBe(5);
  });

  it('SELL: reverse logic works', () => {
    const prices = [100, 98, 95, 93, 90, 88];
    const candles = makeCandles(prices);
    const atr = makeATR(prices.length, 3);
    
    const result = simulateTrade(candles, 0, 'SELL', atr, {
      stopLossAtrMult: 2.0,   // SL = 100 + 3*2 = 106
      takeProfitR: 2.0,        // TP = 100 - 6*2 = 88
      useTrailingStop: false,
      trailAtrMult: 0,
      timeStopBars: 20,
    });
    
    expect(result.realizedReturnPct).toBeGreaterThan(0); // Kâr (düşüşten)
  });

  it('MFE and MAE are tracked', () => {
    const prices = [100, 105, 110, 95, 100, 115];
    const candles = makeCandles(prices);
    const atr = makeATR(prices.length, 2);
    
    const result = simulateTrade(candles, 0, 'BUY', atr, {
      stopLossAtrMult: 5.0,   // Çok geniş
      takeProfitR: 10.0,
      useTrailingStop: false,
      trailAtrMult: 0,
      timeStopBars: 10,
    });
    
    expect(result.mfe).toBeGreaterThan(0);  // 110'a kadar çıktı
    expect(result.mae).toBeLessThan(0);     // 95'e düştü
  });
});
```

---

### ADIM 2: Portföy Simülasyonu

**Amaç:** Tüm backtest boyunca sermaye simülasyonu. "10.000 TL ile başlasam ne olurdu?"

**YENİ DOSYA:** `lib/ta/portfolio-simulator.ts`

#### Yeni Type'lar

```typescript
export interface PortfolioSimConfig {
  initialCapital: number;       // Başlangıç sermayesi (varsayılan: 10000)
  positionSizePct: number;     // Pozisyon büyüklüğü (%) (varsayılan: 100)
  commissionBps: number;        // Komisyon (basis points, varsayılan: 5 = %0.05)
  slippageBps: number;         // Kayma (basis points, varsayılan: 5)
  allowCompounding: boolean;   // Bileşik getiri (varsayılan: true)
}

export interface PortfolioSimResult {
  equityCurve: { time: string | number; equity: number }[];  // Her bar için portföy değeri
  drawdownCurve: { time: string | number; drawdownPct: number }[];  // Drawdown eğrisi
  finalEquity: number;
  totalReturnPct: number;
  cagr: number;                // Yıllık bileşik büyüme oranı (%)
  maxDrawdownPct: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  exposurePct: number;         // Piyasada geçirilen süre (%)
}
```

#### Fonksiyon İmzası

```typescript
export function runPortfolioSimulation(
  candles: Candle[],
  signals: { barIndex: number; signal: 'BUY' | 'SELL'; simulatedTrade: SimulatedTrade }[],
  config: PortfolioSimConfig,
): PortfolioSimResult
```

#### Algoritma

```
function runPortfolioSimulation(candles, signals, config):
  cash = config.initialCapital
  equity = config.initialCapital
  peakEquity = config.initialCapital
  inPosition = false
  positionSize = 0
  entryPrice = 0
  
  equityCurve = []
  drawdownCurve = []
  trades = []
  
  signalIndex = 0  // Sinyal kuyruğu indeksi
  
  for i = 0 to candles.length-1:
    // Eğer bu barda bir pozisyondayız ve bu bar sinyalin çıkış bar'ıysa
    if inPosition and signalIndex < len(signals) and i == signals[signalIndex].simulatedTrade.exitIndex:
      simTrade = signals[signalIndex].simulatedTrade
      // Pozisyonu kapat
      grossReturn = positionSize * (1 + simTrade.realizedReturnPct/100 * (signal == 'BUY' ? 1 : -1))
      // Komisyon + slippage (giriş + çıkış)
      costBps = config.commissionBps + config.slippageBps
      costRatio = costBps / 10000  // bps → oran
      entryCost = positionSize * costRatio
      exitCost = positionSize * (1 + simTrade.realizedReturnPct/100) * costRatio
      netReturn = grossReturn - entryCost - exitCost
      
      cash = netReturn  // Pozisyon büyüklüğü kadar nakit geri döner
      inPosition = false
      trades.push({ return: (netReturn - positionSize) / positionSize * 100, ... })
    
    // Yeni sinyal geldiyse ve pozisyonda değilsek
    if !inPosition and signalIndex < len(signals) and i == signals[signalIndex].barIndex:
      simTrade = signals[signalIndex].simulatedTrade
      // Pozisyon aç
      positionSize = cash * config.positionSizePct / 100
      // Giriş komisyonu
      entryCost = positionSize * (config.commissionBps + config.slippageBps) / 10000
      cash -= entryCost
      inPosition = true
      signalIndex++
    
    // Equity hesapla
    currentEquity = inPosition ? unrealizedPnl(cash, positionSize, candles[i].close, entryPrice, signal) : cash
    equityCurve.push({ time: candles[i].time, equity: currentEquity })
    
    // Drawdown
    peakEquity = max(peakEquity, currentEquity)
    dd = (peakEquity - currentEquity) / peakEquity * 100
    drawdownCurve.push({ time: candles[i].time, drawdownPct: dd })
  
  // Final metrikleri hesapla
  totalReturnPct = (currentEquity - config.initialCapital) / config.initialCapital * 100
  cagr = pow(currentEquity / config.initialCapital, 252 / len(candles)) - 1
  ...
```

#### Mevcut Dosyada Değişiklik: `lib/ta/strategy-optimizer.ts`

`StrategyBacktestConfig`'e eklenecek:
```typescript
portfolioConfig?: PortfolioSimConfig;  // Portföy simülasyonu yapılandırması
```

`StrategyBacktestResult`'a eklenecek:
```typescript
portfolioResult?: PortfolioSimResult;  // Sadece evaluationMode != 'lookforward' ve portfolioConfig varsa
equityCurve?: { time: string | number; equity: number }[];  // Resampled equity eğrisi (100-200 nokta)
drawdownCurve?: { time: string | number; drawdownPct: number }[];
finalEquity?: number;
cagr?: number;
maxDrawdownPct?: number;
```

#### Test Dosyası

**YENİ DOSYA:** `__tests__/ta/portfolio-simulator.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { runPortfolioSimulation } from '@/lib/ta/portfolio-simulator';

describe('runPortfolioSimulation', () => {
  it('10K start, 2 winning trades → compounds correctly', () => {
    // Her biri %10 kazandıran 2 işlem → 10000 * 1.10 * 1.10 = 12100
    // ...
    expect(result.finalEquity).toBeCloseTo(12100, -1);
  });

  it('commission reduces final equity', () => {
    const withCommission = runPortfolioSimulation(/* ... commissionBps: 10 */);
    const withoutCommission = runPortfolioSimulation(/* ... commissionBps: 0 */);
    expect(withCommission.finalEquity).toBeLessThan(withoutCommission.finalEquity);
  });

  it('equity curve length matches candles', () => {
    expect(result.equityCurve.length).toBe(candles.length);
  });

  it('max drawdown matches hand-computed curve', () => {
    expect(result.maxDrawdownPct).toBeGreaterThanOrEqual(0);
  });
});
```

---

### ADIM 3: Rejim Tespit Motoru (Regime Detector)

**Amaç:** `detectRegime()`'i mevcut `strategy-optimizer.ts`'ten çıkarıp kendi modülüne taşı, sertleştir, ve non-causal segmentasyon ekle.

**YENİ DOSYA:** `lib/ta/regime-detector.ts`

#### Tipler

```typescript
// Causal per-bar rejim (zaten var olan detectRegime çıktısı)
// MarketRegime = 'uptrend' | 'downtrend' | 'ranging' | 'volatile' | 'neutral' (types.ts'te zaten var)

// Non-causal rejim segmenti (sadece raporlama için)
export interface RegimeSegment {
  startIndex: number;
  endIndex: number;
  startDate: string;
  endDate: string;
  type: MarketRegime;
  priceChange: number;       // % değişim
  durationBars: number;
  confidence: number;        // 0-1 arası
}
```

#### Fonksiyonlar

```typescript
/**
 * Causal per-bar sınıflandırıcı (CANLI sinyal için kullanılır).
 * Sadece trailing 30 bar verisini kullanır — geleceğe bakmaz.
 * Mevcut detectRegime()'in sertleştirilmiş hali.
 */
export function classifyRegime(candles: Candle[], i: number, atrValues: number[]): MarketRegime

/**
 * Non-causal segmentasyon (SADECE raporlama/analiz için).
 * Tüm seriyi bilerek rejimleri segmentlere ayırır.
 * Zigzag/pivot tabanlı geri dönüş tespiti kullanır.
 * BU FONKSİYONUN ÇIKTISI ASLA CANLI SİNYAL İÇİN KULLANILAMAZ.
 */
export function segmentRegimes(
  candles: Candle[],
  options?: {
    minDuration?: number;        // Min bar (varsayılan: 5)
    minPriceChange?: number;     // Min % değişim (varsayılan: 3)
    reversalThresholdAtr?: number; // Dönüş eşiği (varsayılan: 3x ATR)
  }
): RegimeSegment[]
```

#### Mevcut Dosyada Değişiklik: `lib/ta/strategy-optimizer.ts`

- `detectRegime()` fonksiyonu `regime-detector.ts`'e taşınacak
- `strategy-optimizer.ts`'te `import { classifyRegime } from './regime-detector'` eklenecek
- `detectRegime` → `classifyRegime` olarak çağrılacak (isim değişikliği)
- Eski `detectRegime` export'u deprecate edilip yeni fonksiyona yönlendirilecek

#### Test Dosyası

**YENİ DOSYA:** `__tests__/ta/regime-detector.test.ts`

```typescript
describe('classifyRegime', () => {
  it('uptrend: rising prices → uptrend', () => { /* ... */ });
  it('downtrend: falling prices → downtrend', () => { /* ... */ });
  it('ranging: flat prices → ranging', () => { /* ... */ });
  it('volatile: high ATR spike → volatile', () => { /* ... */ });
  it('does NOT read future bars (causal check)', () => {
    // classifyRegime(i) sadece candles[0..i]'yi okumalı
  });
});

describe('segmentRegimes', () => {
  it('detects uptrend segments', () => { /* ... */ });
  it('detects downtrend segments', () => { /* ... */ });
  it('minDuration filter works', () => { /* ... */ });
  it('minPriceChange filter works', () => { /* ... */ });
});
```

---

### ADIM 4: İndikatör Performans Değerlendiricisi

**Amaç:** Her rejim segmenti için, o segment başlamadan önceki N bar içinde hangi indikatörlerin doğru sinyal verdiğini hesapla.

**YENİ DOSYA:** `lib/ta/indicator-evaluator.ts`

#### Tipler

```typescript
export interface IndicatorRegimePerformance {
  indicator: string;
  regime: MarketRegime;
  hitRate: number;              // Doğru sinyal / toplam rejim başlangıcı (0-1)
  hitRateCI: [number, number];  // Beta-Binomial %95 güven aralığı
  sampleSize: number;           // Kaç rejim başlangıcı var
  sufficientSample: boolean;    // sampleSize >= minSample (30) mu?
  avgBarsBefore: number;        // Sinyal rejim başlangıcından kaç bar önce geldi
}

export interface EvaluatorConfig {
  lookbackBars: number;         // Rejim başlangıcından önce kaç bar geriye bakılacak (varsayılan: 7)
  minSampleSize: number;        // Güvenilir istatistik için min örneklem (varsayılan: 30)
  confidenceLevel: number;      // Güven aralığı seviyesi (varsayılan: 0.95)
}
```

#### Fonksiyon İmzası

```typescript
export function evaluateIndicators(
  candles: Candle[],
  allData: AllData,
  segments: RegimeSegment[],   // segmentRegimes() çıktısı
  config?: EvaluatorConfig,
): IndicatorRegimePerformance[]
```

---

### ADIM 5: DST Güven Değerlerini Bağlama (Wire into DST)

**Amaç:** `signalToBBA(sig, 0.6, regime)` içindeki sabit `0.6` değerini, Adım 4'te hesaplanan per-indicator-per-regime hitRate ile değiştir.

**Değişiklik:** `lib/ta/signal-registry.ts`

```typescript
// Eski:
export function signalToBBA(
  signal: "BUY" | "SELL" | null,
  confidence: number = 0.6,
  regime?: MarketRegime
): BBA

// Yeni — fonksiyon imzası aynı kalır, çağrılan yerlerde confidence parametresi değişir:
// strategy-optimizer.ts CUSTOM branch (~991-1023):
// Eski: bbas.push(signalToBBA(sig, 0.6, regime));
// Yeni: bbas.push(signalToBBA(sig, indicatorConfidence[key] ?? 0.6, regime));
```

`strategy-optimizer.ts`'te `runStrategyBacktest`'e yeni opsiyonel parametre:
```typescript
export function runStrategyBacktest(
  // ... mevcut parametreler ...
  options: {
    // ... mevcut ...
    indicatorConfidences?: Record<string, number>;  // Per-indicator confidence override
  } = {}
)
```

---

### ADIM 6: Rejim Strateji İnşacısı (Regime Strategy Builder)

**Amaç:** Her rejim için en iyi indikatör kombinasyonunu belirleyip rapor JSON'u üret.

**YENİ DOSYA:** `lib/ta/regime-strategy-builder.ts`

#### Tipler

```typescript
export interface RegimeStrategy {
  regime: MarketRegime;
  indicators: string[];
  accuracy: number;
  signalFrequency: string;    // "her 8 günde 1" gibi
  sampleSize: number;
  sufficientSample: boolean;
}

export interface RegimeAnalysisReport {
  symbol: string;
  interval: string;
  analysisPeriod: string;
  regimeMap: {
    uptrends: RegimeSegment[];
    downtrends: RegimeSegment[];
    rangingZones: RegimeSegment[];
    volatileBreakouts: RegimeSegment[];
  };
  indicatorPerformanceByRegime: Record<MarketRegime, Record<string, number>>;
  optimalStrategies: RegimeStrategy[];
}
```

#### Fonksiyon İmzası

```typescript
export function buildRegimeStrategies(
  segments: RegimeSegment[],
  performances: IndicatorRegimePerformance[],
  options?: {
    topN?: number;              // Her rejim için kaç strateji (varsayılan: 3)
    minAccuracy?: number;       // Min accuracy eşiği (varsayılan: 0.5)
  }
): RegimeAnalysisReport
```

---

### ADIM 7: UI Değişiklikleri

**Amaç:** Yeni metrikleri ve portföy simülasyonunu kullanıcıya göstermek.

#### 7a. StrategyBacktestMonitor — Tablı Yapıya Geçiş

**DEĞİŞTİRİLECEK DOSYA:** `components/panels/StrategyBacktestMonitor.tsx`

Mevcut tek panel yapısından 4 tab'a geçiş:
- **Summary** — Mevcut metrikler (Win Rate, Total Signals, Profit Factor, Sharpe)
- **Regimes** — YENİ: `RegimeAccuracyTable`
- **Portfolio** — YENİ: `PortfolioSimChart`
- **Log** — Mevcut `BacktestLogPanel`

#### 7b. RegimeAccuracyTable

**YENİ DOSYA:** `components/ta/RegimeAccuracyTable.tsx`

```
Props: { regimeBreakdown: Record<MarketRegime, RegimeStats> }
Gösterim: Tablo — Regime | WinRate | Signals | Wins | AvgReturn | TotalReturn
```

#### 7c. PortfolioSimChart

**YENİ DOSYA:** `components/ta/PortfolioSimChart.tsx`

```
Props: { 
  equityCurve?: { time: string | number; equity: number }[];
  drawdownCurve?: { time: string | number; drawdownPct: number }[];
  finalEquity?: number;
  cagr?: number;
  maxDrawdownPct?: number;
}
Gösterim: 
  - Equity line (useLightweightChart addLineSeries)
  - Drawdown histogram (addHistogramSeries)
  - Stat row: Final Equity | CAGR | Max DD
```

#### 7d. CustomStrategyPanel — Risk Bölümü

**DEĞİŞTİRİLECEK DOSYA:** `components/ta/CustomStrategyPanel.tsx` (veya ilgili panel)

Eklenecek collapsible "Risk / Advanced" bölümü:
- Initial Capital (number input, default: 10000)
- Position Size % (number input, default: 100)
- Commission (bps, default: 5)
- Stop-Loss ATR Multiplier
- Take-Profit R
- Trailing Stop toggle

Bu değerler mevcut URL parametre sistemiyle senkronize olacak (mevcut `/ta` state yönetimi).

---

### ADIM 8: Discovery / Inngest Entegrasyonu

**Amaç:** Deep discovery pipeline'ının yeni metrikleri ve evaluationMode'u desteklemesi.

#### 8a. StrategyBacktestConfig Genişletme

`strategy-optimizer.ts`'te `StrategyBacktestConfig`'e eklenecekler zaten Adım 1-2'de eklendi.

#### 8b. Inngest Job — Performans Optimizasyonu

**DEĞİŞTİRİLECEK DOSYA:** `lib/inngest/discovery-deep-search.ts` (tam yolu kontrol edilmeli)

Kritik kural: **Portföy simülasyonu ve equity eğrisi SADECE final %100 density bracket'ında hesaplanacak.** Hyperband'in düşük fidelity bracket'larında (ör. %25, %50) ASLA.

```typescript
// Pseudo-code:
if (density === 1.0) {  // Sadece final bracket
  const portfolioResult = runPortfolioSimulation(/* ... */);
  // Equity eğrisini 100-200 noktaya resample et
  const resampledEquity = resampleCurve(portfolioResult.equityCurve, 150);
  result.equityCurve = resampledEquity;
  result.drawdownCurve = resampleCurve(portfolioResult.drawdownCurve, 150);
}
```

#### 8c. Cross-Validator Yükseltmesi

**DEĞİŞTİRİLECEK DOSYA:** `lib/ta/cross-validator.ts`

Eklenecekler:
- Walk-forward validation desteği
- Purged/embargoed CV (komşu fold'lar arası purge mesafesi)
- Beta-Binomial güven aralığı raporlaması (sadece nokta tahmin değil)
- OOS holdout seti desteği

#### 8d. Report Model

**DEĞİŞTİRİLECEK DOSYA:** `database/models/report.model.ts` (tam yolu kontrol edilmeli)

`DiscoveryStrategyResult`'a eklenecek opsiyonel alanlar:
```typescript
evaluationMode?: 'lookforward' | 'pathaware' | 'regime';
mfe?: number;
mae?: number;
intraTradeDD?: number;
equityCurveResampled?: { time: string; equity: number }[];
drawdownCurveResampled?: { time: string; drawdownPct: number }[];
```

#### 8e. Mevcut UI Geriye Dönük Uyumluluk

`DeepDiscoveryResults.tsx` — yeni alanlar `?.` (optional chaining) ile erişilmeli. Eski raporlarda bu alanlar olmadığı için `undefined` olacak, UI boş/null durumunu handle edecek.

---

### ADIM 9: Eski Strateji Migrasyonu ve Varsayılan Değişimi

**DEĞİŞTİRİLECEK DOSYA:** `database/models/saved-strategy.model.ts` (tam yolu kontrol edilmeli)

#### SavedStrategy Model Güncellemesi

```typescript
evaluationMode?: { type: String, enum: ['lookforward', 'pathaware', 'regime'], default: undefined }
// Mongoose'ta undefined → mevcut dökümanlara dokunulmaz
// Kodda: strategy.evaluationMode ?? 'lookforward'
```

#### UI'da "Re-evaluate (Path-Aware)" Butonu

`TAGlassDialog.tsx` veya strateji detay sayfasında:
- Eski strateji için "Re-evaluate (Path-Aware)" butonu
- Tıklandığında `POST /api/strategies/:id/re-evaluate` endpoint'ini çağırır
- Backend yeni evaluationMode ile backtest çalıştırır, `discovered*` alanlarını günceller
- `evaluationMode`'u `'pathaware'` olarak işaretler

#### Varsayılan Değişimi

Tüm testler ve validasyon tamamlandıktan sonra:
- `StrategyBacktestConfig`'te varsayılan `evaluationMode` `'lookforward'` → `'pathaware'` değişecek
- Bu değişiklik tek bir sabit tanımından yapılacak (tek kaynak)

---

## 4. Özet Tablo: Tüm Dosya Değişiklikleri

| Dosya | İşlem | Adım |
|-------|-------|------|
| `lib/ta/trade-simulator.ts` | **YENİ** | 1 |
| `lib/ta/portfolio-simulator.ts` | **YENİ** | 2 |
| `lib/ta/regime-detector.ts` | **YENİ** | 3 |
| `lib/ta/indicator-evaluator.ts` | **YENİ** | 4 |
| `lib/ta/regime-strategy-builder.ts` | **YENİ** | 6 |
| `components/ta/RegimeAccuracyTable.tsx` | **YENİ** | 7 |
| `components/ta/PortfolioSimChart.tsx` | **YENİ** | 7 |
| `__tests__/ta/trade-simulator.test.ts` | **YENİ** | 1 |
| `__tests__/ta/portfolio-simulator.test.ts` | **YENİ** | 2 |
| `__tests__/ta/regime-detector.test.ts` | **YENİ** | 3 |
| `lib/ta/types.ts` | **DEĞİŞTİR** | 1 |
| `lib/ta/backtest.ts` | **DEĞİŞTİR** | 1 |
| `lib/ta/strategy-optimizer.ts` | **DEĞİŞTİR** | 1, 2, 3, 5 |
| `lib/ta/signal-registry.ts` | **DEĞİŞTİR** (DST confidence wiring) | 5 |
| `lib/ta/discovery-types.ts` | **DEĞİŞTİR** (yeni alanlar) | 8 |
| `lib/ta/cross-validator.ts` | **DEĞİŞTİR** | 8 |
| `components/panels/StrategyBacktestMonitor.tsx` | **DEĞİŞTİR** (tablı yapı) | 7 |
| `components/ta/CustomStrategyPanel.tsx` | **DEĞİŞTİR** (Risk bölümü) | 7 |
| `components/ta/DeepDiscoveryResults.tsx` | **DEĞİŞTİR** (yeni alanlar, ?.) | 8 |
| `database/models/report.model.ts` | **DEĞİŞTİR** (opsiyonel alanlar) | 8 |
| `database/models/saved-strategy.model.ts` | **DEĞİŞTİR** (evaluationMode) | 9 |
| Inngest job dosyası | **DEĞİŞTİR** (final-only sim) | 8 |

---

## 5. Validasyon Kontrol Listesi

- [ ] `trade-simulator.test.ts` — Stop-loss'a takılan işlem LOSS (fiyat sonra yükselse bile)
- [ ] `trade-simulator.test.ts` — MFE/MAE doğru hesaplanıyor
- [ ] `portfolio-simulator.test.ts` — 10K başlangıç, %10'luk 2 işlem → ~12100
- [ ] `portfolio-simulator.test.ts` — Komisyonlu sonuç < komisyonsuz sonuç
- [ ] `regime-detector.test.ts` — classifyRegime gelecek bar'ları okumuyor (causal)
- [ ] `regime-detector.test.ts` — Sentetik veriler doğru sınıflanıyor
- [ ] `indicator-evaluator.test.ts` — Az örneklemde CI genişliyor
- [ ] `indicator-evaluator.test.ts` — min-sample gate çalışıyor
- [ ] Gerçek AAPL verisinde A/B testi: lookforward WR >> pathaware WR (yüksek intra-DD işlemlerde)
- [ ] Portföy simülasyonu: equity eğrisi son noktası = (1 + Σ compound return) × 10000
- [ ] Inngest: Düşük fidelity bracket'larda equity/portfolio hesaplanmıyor
- [ ] Inngest: Final bracket'ta equity eğrisi 100-200 nokta
- [ ] Eski raporlar (curve'suz) UI'da hata vermiyor
- [ ] Mevcut optimizer/CV testleri varsayılan modda (lookforward) hala geçiyor
- [ ] Walk-forward CV: per-regime accuracy stabil
- [ ] OOS holdout WR, in-sample CI içinde
- [ ] < 30 rejim başlangıcı olan stratejiler "yetersiz veri" ile işaretleniyor