# 🔍 Root Cause Diagnosis Report

## Bug 1: "Optimize Strategy" (⚡) Button Reduces Win Rate

### Observed Behavior
- **Before**: Win Rate = **65.7%** (full-data backtest)
- **After clicking ⚡ Optimize**: Win Rate drops to **57.4%**
- User expects optimization to *improve* (or at least maintain) the win rate

### Root Cause

The optimize button calls [`optimizeStrategyAction`](lib/actions/optimize-strategy.actions.ts:12) → [`optimizeStrategyParams`](lib/ta/strategy-optimizer.ts:1274), which performs a **70/30 train/test split** on the candle data:

```typescript
// strategy-optimizer.ts:1285-1288
const splitIdx = Math.floor(candles.length * 0.7);
const trainCandles = candles.slice(0, splitIdx);
const testCandles = candles.slice(splitIdx);
```

During optimization, candidate parameters are evaluated using [`evaluateGeneralizationScore`](lib/ta/strategy-optimizer.ts:1248):

```typescript
const score = evaluateGeneralizationScore(trainResult.winRate, testResult.winRate);
// = harmonicMean(trainWR, testWR) × (1 - overfitPenalty × 0.5)
```

This score is used **only for selecting** the best parameters — it's a robust anti-overfitting metric. **However**, the function **reports the test-set (out-of-sample) win rate** as `bestWinRate`:

```typescript
// strategy-optimizer.ts:1331 (lookForward optimization)
bestWinRate = testResult.winRate; // Report out-of-sample Win Rate

// strategy-optimizer.ts:1399 (indicator param optimization)
bestWinRate = testResult.winRate; // Report out-of-sample WR
```

The **test set is only 30% of the data**. The reported 57.4% is the out-of-sample performance on this small slice. The original 65.7% was a full-data backtest. The discrepancy is expected because:

1. **Smaller evaluation window** (30%) → fewer signals → higher variance
2. **Different market regimes** may exist in the test vs. training portion
3. **No full-data validation step** exists after optimization

### Why Discovery Works Fine

The deep discovery pipeline's [`localRefine`](lib/ta/ga-optimizer.ts:770) calls the same `optimizeStrategyParams`, but then **runs a full-data backtest** with the best params:

```typescript
// ga-optimizer.ts:825-833
const finalResult = runStrategyBacktest(candles, 'CUSTOM', updatedAllData, {
    lookForward: bestParams.lookForward ?? 14,
    interval, mode: indMode,
}, {
    customIndicators: indicators, mode: indMode, interval,
});
// Uses finalResult.winRate — full data!
```

The optimize button shortcut **skips this final full-data validation step**.

### Data Flow Trace

```
[⚡ Button Click]
  → handleOptimize()                         (StrategyBacktestMonitor.tsx:401)
    → optimizeStrategyAction()                (optimize-strategy.actions.ts:12)
      → optimizeStrategyParams()              (strategy-optimizer.ts:1274)
        → 70/30 split
        → Bayesian opt on train/test sets
        → evaluateGeneralizationScore for selection
        → RETURNS testResult.winRate only     ← ROOT CAUSE (line 1331, 1399)
    → setOptimizedWinRate(result.bestWinRate) (StrategyBacktestMonitor.tsx:427)
    → displayRate = optimizedWinRate (57.4%)  (StrategyBacktestMonitor.tsx:657)
```

### Fix Plan

**Option A (Recommended — minimal change):**  
After `optimizeStrategyParams` returns, run one final full-data `runStrategyBacktest` with the best params and use that win rate. This mirrors what `localRefine` does.

**Option B (More robust):**  
Modify `optimizeStrategyParams` to accept an optional `returnFullDataWR: boolean` flag. When true, run a final full-data backtest before returning.

**Option C (Architectural):**  
Move the `optimizeStrategyAction` server action to use `localRefine` logic instead, since localRefine already has the correct full-data validation step.

---

## Bug 2: Trade History Modal (🕐) Shows Empty

### Observed Behavior
- UI displays **"67 Signal, 44 Hit"** correctly
- Clicking the clock icon opens the Trade History modal
- The modal table is **completely empty** (no rows)

### Root Cause

In [`StrategyBacktestMonitor.tsx`](components/panels/StrategyBacktestMonitor.tsx), the main `useEffect` (line 502) has an **early return** for discovered strategies:

```typescript
// StrategyBacktestMonitor.tsx:509-521
if (discoveryWinRate && discoveryWinRate > 0) {
    const wins = discoverySignalCount
        ? Math.round((discoveryWinRate / 100) * discoverySignalCount)
        : 0;
    setStats({
        winRate: discoveryWinRate,
        totalSignals: discoverySignalCount ?? 0,
        wins,
        history: [],  // ← EXPLICITLY EMPTY!
    });
    const timer = setTimeout(() => setAnimatedPercent(discoveryWinRate), 300);
    return () => clearTimeout(timer);  // ← EARLY RETURN, skips ALL backtest code below
}
```

For discovered strategies (those loaded from the server with `discoveryWinRate > 0`), the component **intentionally skips the full client-side backtest** to avoid a redundant/duplicate computation — the discovery pipeline already computed the win rate server-side using DST fusion and dynamic ATR-based cooldown.

**However**, the `history` array is set to `[]` (empty) and the code **returns early**, so the backtest loop (lines 542-645) that populates `history` with individual trade records **never executes**.

The **"67 Signal, 44 Hit"** text comes from `stats.totalSignals` and `stats.wins` which ARE populated from `discoverySignalCount` and the calculated `wins`. But the actual trade-by-trade `history` array remains empty.

### Data Flow Trace

```
[Component mounts, discoveryWinRate=65.7, discoverySignalCount=67]
  → useEffect()                              (StrategyBacktestMonitor.tsx:502)
    → if (discoveryWinRate > 0) ← TRUE
      → setStats({
          winRate: 65.7,
          totalSignals: 67,
          wins: 44,
          history: [],     ← EMPTY
        })
      → return;  ← SKIPS FULL BACKTEST (lines 523-653)

[User clicks clock icon]
  → <Dialog> opens                            (StrategyBacktestMonitor.tsx:716)
  → stats.history = []                        ← No rows to render
  → Modal shows empty table
```

### Why It Exists

The comment at line 505-507 explains the intent:

```typescript
// ── Discovered strategies: use archived values, skip duplicate backtest ──
// The server-side engine uses DST fusion + dynamic cooldown (ATR-based),
// while this client-side engine uses simple voting + static cooldown.
// Using archived discovery values ensures consistency with what was saved.
```

The server-side backtest is more sophisticated (DST fusion, ATR-based dynamic cooldown) than the client-side one (majority voting, static cooldown). So re-running the client-side backtest would produce **different results**, which would be inconsistent with the saved `discoveryWinRate`. The developer chose to skip it entirely — but in doing so, also skipped populating the trade history.

### Fix Plan

**Option A (Recommended — populate history from server):**  
Modify the saved strategy metadata to include `tradeHistory: HistoryItem[]`. When running discovery/backtest server-side, store the individual trade records in the database alongside `winRate` and `totalSignals`. The client then renders `stats.history = discoveryTradeHistory` instead of `[]`.

**Option B (Client-side backtest with harmony):**  
Run the full client-side backtest anyway (remove the early return), but only use the history for display. Keep `winRate`, `totalSignals`, and `wins` from `discoveryWinRate`/`discoverySignalCount` for consistency. This means the history table shows trade records even though the aggregate stats come from the server.

**Option C (Pragmatic — run backtest silently):**  
Remove the early return entirely. Run the full client-side backtest which naturally populates `history`. Accept the minor inconsistency between client-side and server-side results (the win rate may differ slightly, but in practice the discrepancy is small, and users get working history).

---

## Summary Table

| Bug | Root Cause | Key File | Line(s) |
|-----|-----------|----------|---------|
| #1: Optimize drops WR | Returns test-set (30%) WR instead of full-data WR after optimization | [`strategy-optimizer.ts`](lib/ta/strategy-optimizer.ts) | 1331, 1399 |
| #2: Empty trade history | Early return for discovered strategies sets `history: []` and skips backtest | [`StrategyBacktestMonitor.tsx`](components/panels/StrategyBacktestMonitor.tsx) | 509-521 |

## Recommended Fix Order

1. **Bug #2 first** (lower risk, purely UI/data issue) — implement Option B or C to get trade history working
2. **Bug #1 second** (requires careful validation that full-data backtest doesn't reintroduce overfitting) — implement Option A
