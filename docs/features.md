RFC: Signalist Paper Trading & Live Forward-Testing Simulation
Status: Draft for review · Author: Architect · Date: 2026-05-26

Executive Summary
Before answering your questions, three architectural decisions need to be locked in upfront because they invalidate parts of your framing:

This is NOT a real-time tick-streaming system. Swing trading evaluates at candle close. Designing for 1-second polling is over-engineering and will burn the Finnhub 60 req/min budget within 10 active users. The architecture must be event-driven on candle-close cron schedules, not on continuous polling.

"Sistem oynayacak" (auto-execution) must be opt-in per strategy, not default. Full silent automation from day one is a footgun even in paper trading because it (a) destroys user trust when a buggy signal fires 50 trades overnight, (b) makes debugging non-deterministic, and (c) creates an audit nightmare. The default must be Shadow Mode (track signals, log what would have executed). Auto-execution is a per-strategy flag the user explicitly toggles on.

The AI must never silently execute trades. It proposes via a tool that renders a confirmation card; the user clicks Confirm. This is non-negotiable — even in paper trading, otherwise the AI's hallucinations become persistent state. This mirrors the existing askClarification pattern.

With those locked, here is the full design.

1. Database Schema & Data Retention
1.1 Wallet — separate collection (not embedded in User)
Decision: New collection wallets. Do not embed into user (which Better Auth owns).

Why: Better Auth manages the user schema; we should not fight it. Wallet has different access patterns (very frequent reads/writes during trading) and needs its own indexes and atomic update semantics. Embedding would also block per-asset wallets later (e.g., paper-USD, paper-crypto sub-balances).

Schema:


wallets {
  _id: ObjectId
  userId: string (unique, indexed) — Better Auth user.id
  currency: 'USD' (enum-ready for future)
  cashBalance: Decimal128       // available cash
  reservedBalance: Decimal128   // funds locked in pending limit orders
  initialBalance: Decimal128    // for ROI calculation
  resetCount: number            // how many times user has reset
  lastResetAt: Date | null
  createdAt, updatedAt: Date
}
Critical: Use Decimal128, not Number. JavaScript floating point will silently corrupt your P&L over time (0.1 + 0.2 !== 0.3). This is a one-line mistake that is brutal to fix later.

1.2 Trade Ledger — immutable append-only
Decision: New collection trades. Each document is one executed (or attempted) fill. Never mutated after insert; corrections create offsetting trades.

Schema:


trades {
  _id: ObjectId
  userId: string (indexed)
  positionId: ObjectId | null   // links to Position; null if position was closed by this trade
  clientRequestId: string (unique, indexed)  // idempotency key
  symbol: string (uppercase, indexed)
  side: 'BUY' | 'SELL'
  quantity: number (positive integer; fractional later)
  fillPrice: Decimal128
  notional: Decimal128          // qty × fillPrice
  fees: Decimal128              // commissions/slippage cost
  realizedPnl: Decimal128 | null // only for SELL trades that close/reduce a position
  triggerSource: 'manual' | 'ai_proposal' | 'strategy' | 'limit_order' | 'stop_loss' | 'take_profit' | 'corporate_action'
  triggerContext: {              // audit trail — CRITICAL
    strategyId?: string
    signalSnapshot?: object      // which indicator(s) fired, the values at fill time
    aiConversationId?: string
    aiMessageId?: string
    quoteSourceTimestamp: Date   // when the Finnhub quote was generated
    slippageBps?: number
  }
  status: 'executed' | 'failed' | 'reversed'
  failureReason: string | null   // mapped error code
  executedAt: Date (indexed)
  createdAt: Date
}
Indexes: {userId, executedAt: -1}, {userId, symbol, executedAt: -1}, {clientRequestId} (unique), {triggerSource}.

The triggerContext object is the single most important field in the entire feature — it is your audit trail. When the user asks "why did the system buy AAPL?", you reconstruct it from here.

1.3 Open Positions — separate from Trades
Decision: Yes, separate collection positions. Do not query trades to derive open positions on every read.

Why: Different query patterns. Positions = small hot dataset queried on every portfolio render. Trades = unbounded append-only log queried for history. Mixing them forces aggregation pipelines on every page load. Worse, computing "current position" from trade history at read time is a nightmare for corporate actions (splits adjust position size, but you don't want to rewrite history).

Schema:


positions {
  _id: ObjectId
  userId: string (indexed)
  symbol: string (uppercase, indexed)
  status: 'open' | 'closed' | 'delisted'
  quantity: number              // current shares (0 once fully closed; row stays for history join)
  avgEntryPrice: Decimal128     // weighted average cost basis
  totalCostBasis: Decimal128    // sum of (qty × price + fees) on the buy side
  realizedPnlToDate: Decimal128 // cumulative from partial sells
  openedAt: Date
  lastTradeAt: Date
  closedAt: Date | null
  closeReason: 'user_sell' | 'stop_loss' | 'take_profit' | 'strategy_exit' | 'delisting' | null
  // metadata for corporate actions
  splitAdjustments: Array<{ratio: number, effectiveDate: Date}>
  createdAt, updatedAt: Date
}
Compound index: {userId, symbol, status} with a partial filter status: 'open' for the hot path. Closed positions stay in the collection (don't archive — joins on trades.positionId need them) but they fall out of the index.

1.4 Concurrency / Double-Spend Prevention
This is the question with the most wrong-but-tempting answers. Three layers, in order:

Layer 1 — Atomic conditional update (covers 95% of cases):
Every balance debit uses findOneAndUpdate with the cost as a precondition:


db.wallets.findOneAndUpdate(
  { userId, cashBalance: { $gte: requiredCost } },
  { $inc: { cashBalance: -requiredCost } },
  { returnDocument: 'after' }
)
If the filter doesn't match (insufficient funds), MongoDB returns null atomically — no race. Do not read-then-write. Do not rely on application-level mutexes (Node has no shared memory across Inngest workers).

Layer 2 — Multi-document transactions for the full trade:
A trade is three writes (debit wallet, upsert position, insert trade). These must be a MongoDB transaction (Atlas supports them on replica sets). If position upsert fails, balance must roll back.

Layer 3 — Idempotency keys for the request path:
Every trade-creating call (from UI, AI, strategy, limit-order) carries a clientRequestId (UUID generated at request origin). The trades collection has a unique index on it. A duplicate POST returns the existing trade record instead of re-executing. This protects against double-clicks, retries, and Inngest at-least-once delivery.

What NOT to do: Don't use a separate "locks" collection with TTL. Don't use Redis (you don't have it). Don't write a custom semaphore. MongoDB atomic ops + transactions + idempotency keys is the standard pattern and it's sufficient.

1.5 New collections — Forward-Test Strategy & Pending Orders

forwardTestStrategies {
  _id, userId, name, symbol, interval ('1d'|'4h'),
  indicatorConfig: { indicator, params } | composite of multiple,
  entryRule: signal threshold (e.g., 'STRONG_BUY' or composite AND/OR),
  exitRule: signal threshold | stop-loss % | take-profit % | timeStop (max days held),
  positionSizing: { mode: 'fixed_cash' | 'percent_portfolio' | 'fixed_shares', value },
  executionMode: 'shadow' | 'auto' | 'propose_only',  // ← THE CRITICAL SAFETY FIELD
  capitalAllocated: Decimal128,
  status: 'draft' | 'running' | 'paused' | 'stopped',
  lastEvaluatedAt: Date, nextEvaluationAt: Date,
  signalsLogged: number, tradesExecuted: number,
  shadowPnl: Decimal128,  // hypothetical P&L if it had been live
  createdAt, updatedAt
}

pendingOrders {
  _id, userId, symbol, side,
  orderType: 'limit' | 'stop_loss' | 'take_profit' | 'market_on_open',
  quantity, triggerPrice (Decimal128),
  parentPositionId: ObjectId | null,   // for SL/TP attached to existing positions
  parentStrategyId: ObjectId | null,
  reservedFunds: Decimal128,            // moved from cashBalance to reservedBalance
  status: 'active' | 'triggered' | 'cancelled' | 'expired',
  expiresAt: Date | null,
  createdAt, triggeredAt, updatedAt
}
Total new collections: 5. That puts the project at 15. This is fine — MongoDB is happy with this and the read patterns are cleanly separated.

2. Backend API & Execution Engine
2.1 Live Strategy Evaluator — event-driven, NOT polling
Wrong instinct: spin up a cron that runs every minute and checks every active strategy.

Right design: one Inngest function per interval, fired at the exact UTC times when that interval's bars close.

1D close cron: 0 21 * * 1-5 (after US market close, ~4 PM ET = 21:00 UTC, weekdays only)
4H close cron: at the four 4H bar close times during US market hours
The function does this:

Load all forwardTestStrategies where interval matches and status: 'running'.
Build the union of symbols across all loaded strategies (e.g., 200 strategies might only span 40 unique symbols).
Fetch candles ONCE per symbol using the existing getDailyCandles / get4HourCandles. This is the rate-limit pressure release valve — it's the difference between 200 Finnhub calls and 40.
For each strategy, call the existing computeIndicators + generateAllSignals from lib/ta/. No new TA logic. This is the whole point of the shared service layer.
If a strategy's entryRule matches and it has no open position: trigger order placement per executionMode (shadow → log only, propose_only → create AI-routed notification, auto → execute trade).
If a strategy's exitRule matches and it has an open position: same fan-out.
Persist lastEvaluatedAt, signalsLogged++, nextEvaluationAt.
This is a single Inngest step pattern reusing the AIJob shape already in lib/inngest/.

2.2 Order Execution — atomic, price-validated
The execution path (whether called from manual UI, AI, strategy, or limit-order trigger) goes through one function in lib/paper-trading/execution-engine.ts. All entry points funnel here.

Flow:

Receive {userId, symbol, side, quantity, clientRequestId, triggerSource, triggerContext}.
Check idempotency — if clientRequestId exists in trades, return that record.
Fetch fresh quote: getCurrentPrice(symbol) with cache: 'no-store' or revalidate: 5. Reject if quote is stale (>60s old).
Sanity guard: reject if quote deviates >20% from last known close — this catches Finnhub bad ticks.
Apply slippage simulation (configurable in user settings, default 5 bps): fillPrice = quote × (1 ± slippageBps / 10000).
Apply commission simulation (default $0).
Compute notional = fillPrice × quantity + fees.
Open a MongoDB transaction:
For BUY: atomic conditional debit on wallets (filter cashBalance >= notional). On failure → INSUFFICIENT_FUNDS.
For SELL: atomic conditional decrement on positions.quantity (filter quantity >= sellQty). On failure → INVALID_POSITION.
Upsert/update position document.
Insert trade document.
Commit transaction.
Fire Notification (existing collection) for non-manual sources.
Return trade record.
Local vs Cloud Resilience. This is where I want to push back on the framing. There is no "user closes their local machine while cloud Inngest is still running" failure mode if you follow one rule: the user's browser/Next.js process holds zero authoritative state. All state lives in MongoDB. Inngest reads from and writes to MongoDB. The Next.js UI is a stateless view layer + RPC client.

Implication: never stash trade state in localStorage beyond UI-ephemeral things like "is the trade modal open". The existing signalist-active-conv localStorage key is fine because it's just a UI hint. But the wallet balance, open positions, pending orders — these are always queried fresh.

2.3 Validation & Error Codes
Extend lib/ai/error-codes.ts with the new domain:


INSUFFICIENT_FUNDS, INVALID_QUANTITY, INVALID_POSITION (selling unowned),
MARKET_CLOSED, STALE_QUOTE, PRICE_DEVIATION_TOO_HIGH,
POSITION_LIMIT_EXCEEDED, STRATEGY_NOT_RUNNING, ORDER_EXPIRED,
DELISTED_SYMBOL, RESERVED_FUNDS_INSUFFICIENT
Each maps to {userMessage, recoverable, action} exactly like existing codes. The ErrorCard registry already renders these — no new UI needed for failures, which is one of the architectural wins of the existing system.

3. Frontend & State Management
3.1 Optimistic UI via Zustand
Extend store/useAppStore.ts with a paperPortfolio slice:


paperPortfolio: {
  walletSnapshot: { cashBalance, reservedBalance, totalEquity, asOf },
  openPositions: Position[],
  recentTrades: Trade[] (last 20),
  activeStrategies: StrategyMeta[],
  pendingOptimistic: Set<clientRequestId>  // in-flight trades
}
On submit: push optimistic delta (decrement balance, add position), record clientRequestId in pendingOptimistic, fire server action. On server confirmation: reconcile (server is source of truth). On error: roll back optimistic delta and surface the error code via the existing ErrorCard flow.

Reconciliation rule: if server returns a state that conflicts with optimistic, server always wins. Show a small toast ("Trade adjusted: filled at $150.23 instead of $150.00 due to price movement").

3.2 Unrealized P&L — hybrid
My recommendation: server-rendered snapshot on page load (uses cached Finnhub quotes), client-side refresh-on-demand via a lightweight /api/portfolio/refresh-prices endpoint that returns only {symbol → currentPrice} and lets the client recompute P&L locally.

Why hybrid: Pure client-side is wrong because every initial render would fire 10+ Finnhub calls. Pure server-side is wrong because then "refresh" requires a full page request. Hybrid lets the dashboard be SSR-friendly and responsive.

Critical: P&L is computed from (currentPrice - avgEntryPrice) × quantity — make sure avgEntryPrice is updated correctly on every partial fill (weighted average). This is a classic place for subtle bugs.

3.3 Navigation & Placement
Recommendation: hybrid, but with a dedicated home.

New dedicated route /portfolio — primary surface. Tabs: Overview / Positions / Trade History / Forward Tests / Pending Orders. This is where the user "lives" when paper trading.
Embedded "Paper Trade" button on /stocks/[symbol]/page.tsx — opens a modal with buy/sell form. Don't make users leave the chart to trade.
"Forward Test This Strategy" button on /ta/page.tsx — the moment the user has configured indicators they're happy with on the TA page, they should be one click away from spinning up a forward test. This is the killer UX moment that closes the loop between historical backtest and forward test.
Add Portfolio to NAV_ITEMS in lib/constants/index.ts.
Avoid creating a parallel /simulation route that duplicates the dashboard. One canonical portfolio surface.

4. AI Agent Integration
4.1 Context Injection — LAZY, not eager
Wrong instinct: stuff the portfolio summary into the system prompt on every request.

Why wrong: (a) the existing sliding window is messages.slice(-6) precisely to keep token budgets low; bloating the system prompt fights this; (b) most chats don't need portfolio context (e.g., "what is RSI?"); (c) it grows linearly with portfolio size.

Right approach: add new tools the AI calls only when needed. The AI's system prompt gets ONE additional sentence: "For portfolio, balance, holdings, or active strategies questions, call getPortfolioStatus. For execution requests, use proposeTrade — never executeTrade directly." That's it. The model already knows how to call tools.

This is consistent with the existing Router Agent categorization in lib/ai/prompts.ts.

4.2 New AI Tools
Add to lib/ai/tools.ts under a new category [PORTFOLIO_TOOLS]:

Tool	Category	Purpose	Output Contract
getPortfolioStatus	PORTFOLIO	Wallet + open positions + total equity + day P&L	New Zod schema
getTradeHistory	PORTFOLIO	Last N trades with reasons	New Zod schema
proposeTrade	PORTFOLIO	Returns a confirmation card; does NOT execute	New schema with requiresConfirmation: true
getActiveStrategies	PORTFOLIO	List forward-tests with stats	New schema
getStrategyPerformance	PORTFOLIO	Per-strategy P&L, win rate, drawdown	New schema
startForwardTest	PORTFOLIO	Create + start a strategy (defaults to shadow mode)	Existing job pattern
pauseForwardTest / resumeForwardTest / stopForwardTest	PORTFOLIO	Lifecycle controls	New schema
getPendingOrders	PORTFOLIO	List active limit/stop orders	New schema
Notice what's missing: there is no executeTrade tool exposed to the AI. The AI can only proposeTrade. Execution is a user-initiated action via the confirmation card.

Total tools after this: 18 + 9 = 27 tools. Update the Router Agent category list in lib/ai/prompts.ts accordingly.

4.3 Human-in-the-Loop Authorization
Reuse the existing Component Registry pattern. Steps:

AI calls proposeTrade → output contract returns { symbol, side, quantity, estPrice, estCost, reasoning, expiresAt, confirmationToken }.
Add a new card component TradeConfirmationCard in components/ai/.
Register it in components/ai/registry.tsx under TOOL_COMPONENT_MAP.proposeTrade.
The card renders the proposal + a Confirm button and a Reject button.
Confirm calls a new server action confirmAITrade(confirmationToken, clientRequestId) which validates the token (signed, time-bounded), fetches the proposal, and routes through the standard execution engine with triggerSource: 'ai_proposal'.
The card updates its UI state (confirmed/rejected) via addToolOutput from useChatManager — exact same pattern as the existing background jobs.
The confirmationToken is critical — it's a server-issued, signed, time-limited token containing the trade params. Without it, the client could craft any trade payload claiming "the AI told me to". With it, the server can verify "yes, the AI did propose exactly this trade in this conversation at this time".

5. Asynchronous Background Jobs (Inngest)
5.1 Strategy Monitoring
Add to lib/inngest/functions.ts (or split into lib/inngest/forward-test-monitor.ts for clarity):

evaluateForwardTestsDaily — cron 0 21 * * 1-5 UTC. Handles 1D strategies.
evaluateForwardTests4H — cron at the four 4H bar close times. Handles 4H strategies.
evaluatePendingOrders — cron every 15 min during US market hours */15 13-21 * * 1-5. Handles limit/stop orders (these need finer granularity than candle closes because the trigger price could be hit intraday).
processCorporateActionsDaily — cron 0 22 * * *. Adjusts positions for splits, credits dividends, handles delistings.
Rate-limit math: with 50 unique symbols across 200 strategies and 4 cron times/day for 4H + 1/day for 1D = ~250 candle fetches/day, well under 60/min budget. Plus the quote calls inside evaluatePendingOrders are batched. We're safe.

Critical optimization: the evaluateForwardTests* functions should fetch each candle ONCE and then evaluate N strategies against it in-memory. Do not put strategy evaluation inside a per-strategy fetch loop. The cached fetchJSON in lib/actions/finnhub.actions.ts will deduplicate concurrent calls but the in-job dedup is even cheaper.

5.2 Limit Orders & Stop-Loss
Stored in pendingOrders. Funds are reserved (reservedBalance in wallet) at order placement, not at trigger time. This is the right model — otherwise a user could place 100 limit orders for $100k each on a $10k portfolio.

evaluatePendingOrders Inngest function:

Load all active pending orders, group by symbol (union ~30 symbols).
Batch-fetch quotes (1 call per unique symbol).
For each order: if quote crosses triggerPrice, mark triggered and route through execution engine.
Release reservedBalance on fill, cancel, or expiry.
Edge case to call out: what if two pending orders on the same symbol both trigger in the same evaluation cycle? Process them in deterministic order (by createdAt) so behavior is reproducible.

6. Edge Cases & Business Logic
6.1 Signal during market closed
Don't execute. Insert a pendingOrders row with orderType: 'market_on_open'. The evaluatePendingOrders cron picks it up at the next market open and executes at the open price. Document this clearly in the UI so users understand why their Friday-9pm signal didn't fill until Monday morning.

Subtle gotcha: make sure your "market open" detection accounts for US market holidays (Christmas, Thanksgiving, etc.). Either hardcode the calendar in a constants file or use a small JSON fetched at boot. Finnhub doesn't reliably expose this.

6.2 Stock splits
processCorporateActionsDaily Inngest function:

Fetch corporate actions from Finnhub /stock/split for the universe of symbols in positions where status: 'open'.
For each split (e.g., 4-for-1 AAPL):
Update position: quantity *= ratio, avgEntryPrice /= ratio, append to splitAdjustments audit log.
Adjust any pending orders on the symbol (limit prices, stop prices) by the same ratio.
Notify user via existing Notification collection.
Total cost basis is unchanged. P&L computation continues normally.
6.3 Delistings
When a corporate action of type delisting is detected:

Fetch the last known price.
Force-close the position: insert a SELL trade with triggerSource: 'corporate_action', set position.status: 'delisted', credit cashBalance with the proceeds.
Notify the user.
Mark any forward tests on that symbol as paused with reason.
6.4 Other edge cases you didn't ask about but matter
Conflicting strategy signals: two strategies on the same symbol, one says BUY, one says SELL. Execute in createdAt order; second one becomes a reverse trade. Log both signals in triggerContext.
Strategy fires repeatedly: add a cooldown (e.g., one signal per strategy per day) configured per strategy. Otherwise an oscillating indicator generates 6 BUY/SELL/BUY/SELL signals on a 4H interval in a single day.
User resets wallet while positions are open: close all positions at current price (record proceeds as final realized P&L), cancel pending orders, archive the entire trade history snapshot with a resetCycle tag so historical performance is queryable per cycle, then reset balance. Increment wallet.resetCount.
Forward-test deletion with open positions: require the user to either close positions manually first or accept a forced close. Don't silently orphan positions.
7. Architectural Critique & Brainstorming (the meat of this RFC)
7.1 Things in your original brief that I'd push back on
Your assumption	My critique	Better approach
"Real-time live data stream"	Wrong frame for swing trading. Real-time tick streaming costs money (WS connections, infra) and adds nothing for day-or-week holds.	Candle-close event-driven. Inngest crons aligned to bar closes.
"Sistem oynayacak yani" (fully autonomous)	Dangerous default. Silent autonomy will destroy user trust the first time a buggy signal trades 20 times overnight.	Default executionMode: 'shadow'. Auto-execute is per-strategy opt-in with a clear warning UI.
AI as autonomous executor	Hard no. AI hallucinates; even rare hallucinations × autonomy = state corruption.	AI proposes via tool that returns confirmation card. User confirms in 1 click.
"Polling 24/7"	Misframes the problem and torches your Finnhub budget.	Event-driven cron at candle-close times. No polling between bars.
"Inject portfolio into AI context"	Token bloat × every chat × every user.	Lazy tool calls. AI fetches when needed.
Embed wallet in User	Fights Better Auth, blocks future multi-currency, harder atomic ops.	Separate wallets collection with Decimal128.
Open + closed positions in one collection	Different query patterns; aggregation overhead on every read.	Separate positions (small hot set) and trades (append-only log).
Number for money	JavaScript floating point will corrupt balances over months.	Decimal128, full stop.
7.2 Must-have features you haven't mentioned
These are not nice-to-haves. They are table stakes for a serious paper trading lab:

Performance metrics dashboard. Not just "current balance" but: total return %, annualized return, Sharpe ratio, max drawdown, win rate, average win/loss, profit factor, time-weighted return. Compute server-side from the trade ledger; cache results. Without this, the user can't actually evaluate whether their strategies work — which is the entire point of the feature.
Position sizing rules at the strategy level. Fixed cash, % of portfolio, fixed shares, volatility-adjusted (Kelly-like). Stored on the strategy doc.
Risk management caps per user. Max position size as % of portfolio (default 20%), max number of open positions (default 10), max daily loss circuit breaker (auto-pause all strategies if hit). These are stored on the wallet doc or a riskSettings doc.
Audit trail — every automated trade must be explainable. The triggerContext.signalSnapshot field I included does this. If you skip it, users will rage when a trade fires and they can't see why.
Strategy versioning. When a user edits a running strategy, the previous version's P&L attribution should not be confused with the new version. Either fork on edit or version-stamp every trade with the strategy version that triggered it.
Reset/replay capability. Users must be able to reset their wallet without losing access to historical performance data (use resetCycle field on trades/wallet). Don't physically delete history.
Trade tagging/notes. Users want to write "thesis: golden cross with confirming volume" on each trade. Cheap to add, huge UX value.
Export to CSV. Tax season, external analysis, sharing with friends. One server action, one button.
7.3 Anti-features — explicitly avoid
Don't build	Why
Short selling	Doubles the state machine (negative positions, margin requirements, borrow rates). Massive complexity for a paper trading MVP.
Margin / leverage	Same as above. Risk model becomes nontrivial.
Options	Different math, different lifecycle, different pricing. Entirely separate product.
Crypto / FX / commodities	Scope creep. Your data pipeline is equity-focused.
Real-time WebSocket pricing	Cost (infra), complexity (state sync), zero benefit for swing trading.
Multiple portfolios per user	Premature multi-tenancy. One user = one wallet. Reset for "new experiments".
Strategy marketplace / sharing	Social feature; build the core first.
Inter-user leaderboards	Compares apples to oranges (different start dates, risk profiles). Will distort behavior.
Mobile push notifications	Use existing email + in-app Notification. Push is a whole infra commitment.
Custom-Python-scripted strategies	The shared lib/ta/ engine is your moat. Don't open a sandboxed JS executor.
7.4 Out-of-the-box features that elevate this from toy to lab
Configurable slippage simulation. Strategy or user-level setting: "simulate N bps of slippage and a 1-bar execution delay". Real trades aren't filled at the close price — modeling this teaches users about real-world friction. Stored as slippageBps and executionDelayBars on the strategy.
Shadow mode as the default execution mode. Strategy runs and logs shadowPnl continuously, but no real trades happen. User can flip the switch to auto once they trust it. This is the single most important feature for user trust. Add a "Shadow P&L vs Live P&L" comparison view per strategy.
Behavioral / psychological metrics. Track: avg holding time vs. strategy's optimal holding time (are you exiting too early?), revenge-trade detection (entering a new position within X minutes of a loss), FOMO entries (entering after a >5% pump). Surface these as a "Trader Health" tab. This is genuinely differentiating and uses data you already have.
Dividend handling. When processCorporateActionsDaily detects an ex-dividend date for an open position, credit qty × dividendPerShare to the wallet and log it as a non-trade ledger event. Simple but important for accuracy.
AI-generated trade journal entries. Reuse the existing Gemini pipeline (already used for welcome emails and news summaries). Daily/weekly cron generates a "Here's what happened with your portfolio today" summary from the trade ledger and notifications. Tiny incremental cost, huge engagement.
What-If replay. "Replay this strategy on last 12 months of live data we just observed". Different from historical backtest — it uses the exact live data the system has been collecting, including any data quality issues, gaps, and corporate actions. Builds confidence that backtest and forward test are consistent.
Strategy correlation analysis. When the user has multiple active strategies, show how correlated their signals are. Two strategies that always fire together aren't actually a portfolio — they're one position with two names.
8. Actionable Roadmap
Phased delivery so we can ship value early. Each phase is independently deployable.

Phase 1 — Foundation (no AI, no automation)
New files:

database/models/wallet.model.ts — schema per §1.1
database/models/position.model.ts — schema per §1.3
database/models/trade.model.ts — schema per §1.2
lib/actions/wallet.actions.ts — getWallet, resetWallet, internal debitWallet/creditWallet (atomic conditional ops)
lib/actions/trade.actions.ts — executeManualTrade(input), getTradeHistory(filters), internal executeTradeInternal (the engine entry point)
lib/paper-trading/execution-engine.ts — single funnel for all trade executions (§2.2)
lib/paper-trading/portfolio-metrics.ts — P&L, performance metrics, server-side
app/(root)/portfolio/page.tsx — main portfolio page with Overview tab
components/portfolio/PortfolioOverview.tsx, PositionsTable.tsx, TradeHistory.tsx, ManualTradeModal.tsx
Modified files:

lib/ai/error-codes.ts — add new codes (§2.3)
lib/constants/index.ts → NAV_ITEMS — add Portfolio nav item
components/layout/NavItems.tsx — render it
store/useAppStore.ts — add paperPortfolio slice (§3.1)
app/(root)/stocks/[symbol]/page.tsx — add "Paper Trade" button → opens ManualTradeModal
Validation: at end of Phase 1, a user can deposit virtual $10k, manually buy AAPL, sell some of it, see realized + unrealized P&L on /portfolio. No AI, no strategy automation yet.

Phase 2 — Forward Tests in Shadow Mode
New files:

database/models/forward-test-strategy.model.ts
lib/actions/forward-test.actions.ts
lib/inngest/forward-test-monitor.ts — evaluateForwardTestsDaily, evaluateForwardTests4H (§5.1)
components/portfolio/ForwardTestList.tsx, ForwardTestCreator.tsx, StrategyPerformancePanel.tsx
Modified files:

app/(root)/ta/page.tsx — add "Forward Test This Strategy" button → opens ForwardTestCreator pre-filled with current TA config
app/api/inngest/route.ts — register new functions
lib/inngest/client.ts — no changes (existing setup is sufficient)
app/(root)/portfolio/page.tsx — add Forward Tests tab
Critical: all new strategies created in Phase 2 are executionMode: 'shadow' by default. No actual trades fire from strategies yet. The system logs what would have happened in shadowPnl. This builds confidence that the evaluation logic is correct before flipping the switch.

Phase 3 — Pending Orders + Auto-Execution
New files:

database/models/pending-order.model.ts
lib/actions/pending-orders.actions.ts
lib/inngest/pending-order-processor.ts — evaluatePendingOrders (§5.2)
components/portfolio/PendingOrdersTable.tsx
Modified files:

lib/paper-trading/execution-engine.ts — handle MARKET_CLOSED by routing to pending orders
lib/actions/forward-test.actions.ts — allow user to switch a strategy from shadow to auto (with a confirmation modal warning)
lib/inngest/forward-test-monitor.ts — when executionMode: 'auto', route through execution engine
Phase 4 — Corporate Actions + Edge Cases
New files:

lib/paper-trading/corporate-actions.ts — split/dividend/delisting logic
lib/inngest/corporate-action-processor.ts — processCorporateActionsDaily (§6.2)
lib/constants/market-calendar.ts — US market holidays + early-close days
Modified files:

database/models/position.model.ts — already includes splitAdjustments; ensure migration path
lib/paper-trading/execution-engine.ts — market-hours check, holiday awareness
Phase 5 — AI Integration
New files:

components/ai/TradeConfirmationCard.tsx — confirmation UI per §4.3
lib/paper-trading/ai-trade-confirmation.ts — signed token issue + verify
Modified files:

lib/ai/tools.ts — add 9 new tools per §4.2 with full 5-defense-layer treatment (Zod, try-catch, timeout, yield, toToolError)
lib/ai/tool-contracts.ts — Zod output schemas for each new tool
lib/ai/prompts.ts — add [PORTFOLIO_TOOLS] category to Router Agent, add one-line guardrail about proposeTrade vs executeTrade, add explicit "you are not a financial advisor, all trades are simulated" reminder
components/ai/registry.tsx — register TradeConfirmationCard and any new portfolio cards (PortfolioStatusCard, StrategyListCard, etc.)
lib/actions/trade.actions.ts — confirmAITrade(token, clientRequestId) server action
Phase 6 — Pro-Grade Polish
In priority order:

Performance metrics dashboard (lib/paper-trading/portfolio-metrics.ts extension + new MetricsPanel.tsx)
Risk management caps (new risk-settings.model.ts + circuit breaker logic in execution engine)
Slippage + commission simulation (already shimmed in execution engine; expose UI controls)
CSV export (one new server action, button in TradeHistory.tsx)
Behavioral metrics (lib/paper-trading/behavioral-metrics.ts + new tab)
AI-generated weekly journal (extend existing Gemini Inngest pipeline)
Closing Notes for Implementation
Test infrastructure: the existing Vitest setup (41 tests, lib/validations, lib/indicators, lib/ta/backtest, lib/ai/error-codes) must be extended. At minimum: unit tests for execution-engine.ts (insufficient funds, idempotency, transaction rollback), portfolio-metrics.ts (P&L math, Sharpe), and corporate-actions.ts (split arithmetic). Aim for 60+ tests by Phase 4.
Don't touch the critical files listed in rules-critical.md (middleware, auth singleton, mongoose cache, CanonicalMessage layer, tool-parser). Everything new should be additive.
Migration: Phase 1 needs zero data migration — only new collections. Existing users get a wallet lazily on first portfolio page visit.
Feature flag the whole thing for the first two phases via a simple PAPER_TRADING_ENABLED env var. Lets us merge to main early without exposing half-finished UX.
The most important architectural sentence in this entire document: MongoDB is the source of truth; the user's machine holds no authoritative state. Get that right and the local-vs-cloud resilience question becomes a non-issue.

Want me to drill into any specific section further (e.g., the AI confirmation token flow, the Decimal128 migration strategy, or the corporate-actions math)?