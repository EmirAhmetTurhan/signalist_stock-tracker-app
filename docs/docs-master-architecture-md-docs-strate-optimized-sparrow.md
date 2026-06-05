# Signalist — Regime Ground Truth + Path-Aware & Portfolio Backtest

## Context

The current backtest (`runStrategyBacktest`) judges a trade by comparing only two prices —
entry `Close[t]` and `Close[t + lookForward]` — at
[strategy-optimizer.ts:1141-1146](lib/ta/strategy-optimizer.ts#L1141-L1146). It is
*path-independent* (a trade that drops -40% then closes +1% scores a WIN) and *capital-blind*
(it never answers "what would 10,000 TL become?"). The entire optimizer / CV / discovery /
GA / MCTS / Hyperband / DE stack inherits this flawed ground truth.

The user wants to (a) **replace** the look-forward ground truth with a regime-based one,
(b) add **path-aware** single-trade evaluation (SL/TP, intra-trade drawdown, MFE/MAE), and
(c) add a **portfolio simulation** (initial capital, position sizing, commission/slippage,
compounding, equity curve + drawdown chart). This plan answers the user's questions with
code-grounded analysis and a staged, replace-behind-a-flag roadmap.

**Reuse, don't rebuild — much already exists:**
- `detectRegime()` (causal, trailing-30-bar): [strategy-optimizer.ts:757-808](lib/ta/strategy-optimizer.ts#L757-L808).
- Per-regime `regimeBreakdown`: [strategy-optimizer.ts:1206-1220](lib/ta/strategy-optimizer.ts#L1206-L1220); regime-aware DST `signalToBBA`: [signal-registry.ts:401-425](lib/ta/signal-registry.ts#L401-L425); per-regime Beta-Binomial `StrategyMeta`.
- Money/exec: [decimal-utils.ts](lib/paper-trading/decimal-utils.ts) (`DEFAULT_SLIPPAGE_BPS=5`, decimal ops), `applySlippage()` [execution-engine.ts:91-98](lib/paper-trading/execution-engine.ts#L91-L98), position sizing [forward-test-evaluator.ts:182-195](lib/paper-trading/forward-test-evaluator.ts#L182-L195), default capital 10,000 (Wallet model).
- Chart hook `useLightweightChart` ([hooks/useLightweightChart.ts](hooks/useLightweightChart.ts)) — `addLineSeries`+`addHistogramSeries` for equity/drawdown.
- Missing entirely: `regime-detector.ts`, `indicator-evaluator.ts`, `regime-strategy-builder.ts`, `trade-simulator.ts`, `portfolio-simulator.ts`, and any equity-curve.

---

## Analysis — Original 5 Questions (condensed)

**Q1 — Approach valid?** Diagnosis right; one serious trap. A "trend that started at T0" is
only knowable *after* it plays out. If regimes are segmented from the full future-containing
series and you then trade the indicators that "predicted T0," the **label itself carries
look-ahead bias** — not tradeable live. Fix: split *non-causal segmentation* (analysis/
explainability only) from *causal per-bar regime* (the only thing allowed to feed signals).

**Q2 — Regime math.** Two detectors, kept separate: (1) causal per-bar classifier = harden
existing `detectRegime` (replace ADX-approx with the real DMI/ADX you compute; normalize
thresholds by ATR; require ≥N-bar persistence); (2) non-causal segmentation map = ATR-based
zigzag/directional-change (≈3×ATR reversal, min duration/magnitude) or HMM-Viterbi — analysis
only. Starter thresholds: trend `|slope|>0.3%` & ADX>25; ranging `|slope|<0.15%` &
ATR/avgATR<1.2; volatile ATR/avgATR>1.8; min duration 5-10 bars. Tune per-asset, validate OOS.

**Q3 — Keep DST?** Keep it; complementary layers. Regime = *which indicators to trust here*;
DST = *how strong the combined belief is*. Don't touch Dempster math. Real upgrade: replace
the fixed `0.6` confidence in `signalToBBA` with the per-indicator-per-regime posterior from
the evaluator (= the existing `StrategyMeta` Beta-Binomial). Connect dots, don't fork.

**Q4 — Order.** Path-aware trade eval first (correct regardless of the regime debate, lowest
risk, gives every downstream metric a trustworthy basis), then portfolio sim, then regimes.

**Q5 — Biggest handicap + overfitting.** Look-ahead-in-labeling (Q1) + multiple-comparisons
explosion (indicators × regimes × params × combos) on *tiny* per-regime samples (8-15
uptrends/10yr → 90% on 10 trades is noise). 5-fold CV is necessary, not sufficient (i.i.d.
folds violated). Mitigate: walk-forward + purged/embargoed CV; report Beta-Binomial credible
intervals not means; min-sample gate (≥~30 regime starts else "insufficient data");
multiple-testing/deflated-Sharpe; untouched OOS holdout; cross-symbol validation.

---

## Extended Design Decisions (the 5 follow-ups)

### A. Portfolio simulation — `lib/ta/portfolio-simulator.ts` (separate module)

Two distinct layers, cleanly separated:
- **`trade-simulator.ts`** = *single-trade mechanics*. `simulateTrade(candles, entryIdx,
  signal, riskCfg)` walks bars forward, exits on first of SL / TP / trailing-stop / opposite
  signal / time-stop(=lookForward); returns `{exitIdx, exitReason, realizedReturnPct, mfe,
  mae, intraTradeMaxDD}`. Pure, no money.
- **`portfolio-simulator.ts`** = *capital simulation over the whole backtest*. Consumes the
  ordered signal stream + each trade's exit decision, maintains cash (start 10,000), one
  position at a time, applies **position sizing %**, **commission + slippage**, **compounds**
  equity, and records a **bar-by-bar equity snapshot** → `{equityCurve:{time,equity}[],
  drawdownCurve, finalEquity, totalReturnPct, cagr, maxDrawdownPct, tradeCount, exposurePct}`.

Interface/integration: the backtest loop emits signals → `trade-simulator` decides each
exit → `portfolio-simulator` books cash/position and snapshots equity. **Reuse**
`decimal-utils` ops + `DEFAULT_SLIPPAGE_BPS`, `applySlippage()` logic, the 3 position-sizing
modes from `forward-test-evaluator`, and the `peakEquity/maxDrawdown` pattern already in
`runStrategyBacktest`. In-memory only (numbers, not Decimal128) — this is a simulation, not
the money ledger.

### B. Stop-loss / take-profit parameters — extend `ProfileConfig`

Add to [strategy-optimizer.ts ProfileConfig](lib/ta/strategy-optimizer.ts#L656-L684):
`stopLossAtrMult`, `takeProfitR` (reward:risk — TP distance = R × stop distance),
`useTrailingStop`, `trailAtrMult`. `timeStop` reuses existing `lookForward`. Suggested
defaults — Aggressive `{SL 1.5×ATR, TP R=1.5, trailing on}`, Balanced `{SL 2.0, R=2.0,
off}`, Conservative `{SL 2.5, R=3.0, off}` (tune + validate). **User editing**: a collapsible
"Risk / Advanced" section in `CustomStrategyPanel` (capital, position-size %, SL/TP, trailing)
+ URL params (consistent with existing URL-driven `/ta` state), passed through
`StrategyBacktestConfig`.

### C. UI surfaces

Make `StrategyBacktestMonitor` ([components/panels/StrategyBacktestMonitor.tsx](components/panels/StrategyBacktestMonitor.tsx))
**tabbed**: `Summary | Regimes | Portfolio | Log`.
- *Regimes* tab: new `RegimeAccuracyTable` (Regime | WinRate | Signals | AvgReturn |
  TotalReturn), reused to upgrade the collapsible in
  [DeepDiscoveryResults.tsx:237-257](components/ta/DeepDiscoveryResults.tsx#L237-L257) into a
  full table.
- *Portfolio* tab: new `PortfolioSimChart` (equity line + drawdown histogram via
  `useLightweightChart`) + final-equity/CAGR/maxDD stat row.
- *Log* tab: existing `BacktestLogPanel`.
SL/TP/capital inputs live in `CustomStrategyPanel`'s new Risk section. No new top-level `/ta`
section needed — everything sits inside the monitor that already owns backtest context.

### D. Legacy strategy migration

Add optional `evaluationMode: 'lookforward'|'pathaware'|'regime'` to `SavedStrategy`,
`StrategyBacktestConfig`, and `DiscoveryStrategyResult`. **Non-destructive**: treat missing
field as `'lookforward'` in code (Mongoose default applies on create, not to existing docs —
handle `?? 'lookforward'`). Legacy strategies keep their stored `discovered*` metrics shown
under a "lookforward" badge; a **"Re-evaluate (path-aware)"** action recomputes on demand and
updates the `discovered*` fields + tags `evaluationMode='pathaware'`. New discoveries run in
the new mode once the default flips. No bulk migration script.

### E. Inngest deep-search compatibility

Extend the single `StrategyBacktestConfig` ([strategy-optimizer.ts:61-90](lib/ta/strategy-optimizer.ts#L61-L90))
with `evaluationMode` + risk params — `cross-validator` and `hyperband-search.evaluateAtDensity`
inherit it automatically. New metrics (MFE/MAE/intraDD/per-regime accuracy) become **optional**
fields on `StrategyBacktestResult` and on `DiscoveryStrategyResult`
([report.model.ts:16-41](database/models/report.model.ts#L16-L41)) — optional + UI `?.` means
old reports still render. **Serialization rules (critical):** never compute portfolio
sim/equity in low-fidelity Hyperband brackets (perf); compute it **only at final 100% density
+ portfolio stage**; **resample equity curves to ~100-200 points**; keep stripping arrays in
`bracketToCheckpoint` ([discovery-deep-search.ts:119-152](lib/inngest/discovery-deep-search.ts#L119-L152)).
`fullData` stays `null`; resampled curve rides in the per-strategy result entry only.

---

## Implementation Roadmap (end state: look-forward replaced; flag-gated migration)

Gate everything behind `config.evaluationMode` (default `'lookforward'` until validated,
then flip). Steps 1-3 are the core ground-truth fix; the rest layer on regimes, UI, and
discovery.

1. **`lib/ta/trade-simulator.ts`** — path-aware single-trade exits (SL/TP/trail/opposite/
   time), MFE/MAE/intra-DD. Replace the 2-point `isWin` at
   [strategy-optimizer.ts:1141-1146](lib/ta/strategy-optimizer.ts#L1141-L1146) under the flag.
   Extend `BacktestHistoryItem` + `StrategyBacktestResult` ([types.ts](lib/ta/types.ts)).
2. **`lib/ta/portfolio-simulator.ts`** — capital/equity simulation (§A). Add SL/TP/risk fields
   to `ProfileConfig` + `StrategyBacktestConfig` (§B).
3. **`lib/ta/regime-detector.ts`** — extract+harden causal `detectRegime`; add non-causal
   `segmentRegimes(): RegimePoint[]` (analysis map). Re-export to avoid breaking callers.
4. **`lib/ta/indicator-evaluator.ts`** — per-regime, **causal** per-indicator hit-rate using
   path-aware outcomes (not hindsight labels); Beta-Binomial credible intervals + min-sample
   gate; persist into existing `StrategyMeta`.
5. **Wire into DST** — replace fixed `0.6` in `signalToBBA` with the per-indicator-per-regime
   posterior (Dempster math untouched).
6. **`lib/ta/regime-strategy-builder.ts`** — assemble per-regime combos (min-sample +
   multiple-testing guards); emit the report JSON (STRATEGY_ANALYSIS_PLAN §4.4).
7. **UI** (§C) — tabbed `StrategyBacktestMonitor`, `RegimeAccuracyTable`, `PortfolioSimChart`,
   Risk section in `CustomStrategyPanel`.
8. **Discovery/Inngest** (§E) — extend config + optional result fields; final-stage-only
   resampled equity; CV upgrade (walk-forward + purged/embargoed, credible intervals, OOS
   holdout) in [cross-validator.ts](lib/ta/cross-validator.ts).
9. **Migration** (§D) + **flip default** once Steps 1-8 validate.

**Files:** *new* — `trade-simulator.ts`, `portfolio-simulator.ts`, `regime-detector.ts`,
`indicator-evaluator.ts`, `regime-strategy-builder.ts`, `RegimeAccuracyTable.tsx`,
`PortfolioSimChart.tsx`; *modified* — `strategy-optimizer.ts`, `types.ts`, `signal-registry.ts`,
`cross-validator.ts`, `discovery-deep-search.ts`, `report.model.ts`, `saved-strategy.model.ts`,
`discovery-types.ts`, `discover-strategy.actions.ts`, `StrategyBacktestMonitor.tsx`,
`CustomStrategyPanel.tsx`, `DeepDiscoveryResults.tsx`, `/ta` page wiring.

---

## Verification

- **Unit (`npx vitest run`):** `trade-simulator.test.ts` — a path that pierces the stop is a
  LOSS even if it closes up (the exact case look-forward gets wrong); MFE/MAE correct on
  hand-built paths. `portfolio-simulator.test.ts` — 10,000 start, fixed sequence of
  +/- trades compounds to the expected final equity; commission+slippage reduce it
  deterministically; max-DD matches a hand-computed equity curve. `regime-detector.test.ts`
  — synthetic regimes classify right; assert the causal classifier reads no future bars.
  `indicator-evaluator.test.ts` — credible interval widens as samples shrink; min-sample gate
  fires.
- **A/B ground truth:** run real AAPL in `lookforward` vs `pathaware`; confirm inflated
  win-rate on high-intra-DD trades; compare to docs §14 "30 signals → 18 hit → 60%".
- **Portfolio sanity:** equity curve endpoint == `(1+Σ compounded trade returns net of costs)
  × 10,000`; drawdown chart troughs align with losing streaks.
- **Inngest:** run a discovery job, confirm step outputs/ checkpoints stay small (no full
  equity arrays in brackets), final Report carries resampled curves, and the existing
  DeepDiscoveryResults UI still renders old (curve-less) reports via `?.`.
- **Overfitting gate:** walk-forward windows show stable per-regime accuracy; OOS holdout WR
  within CI; reject any per-regime strategy with <~30 regime starts.
- **No regression:** existing optimizer/CV tests pass with default mode unchanged until Step 9.
