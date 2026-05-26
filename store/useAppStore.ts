import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type WatchlistItem = { symbol: string; company: string; addedAt?: string };
type IndicatorState = { name: string; active: boolean };

// Paper Portfolio state (NOT persisted — server is source of truth)
interface PaperPortfolioState {
  walletSnapshot: WalletSnapshot | null;
  openPositions: PortfolioPosition[];
  recentTrades: PortfolioTrade[];
  pendingOptimistic: string[]; // clientRequestIds in-flight
  isLoading: boolean;
}

interface AppState {
  // Watchlist
  watchlist: WatchlistItem[];
  setWatchlist: (items: WatchlistItem[]) => void;
  addToWatchlistOptimistic: (symbol: string, company: string) => void;
  removeFromWatchlistOptimistic: (symbol: string) => void;

  // Active indicators
  activeIndicators: string[];
  setActiveIndicators: (indicators: string[]) => void;

  // AI action log
  lastToolAction: { tool: string; payload: unknown } | null;
  setLastToolAction: (action: { tool: string; payload: unknown } | null) => void;

  // Global arka plan is takibi: convId -> jobId (sidebar spinner + chat polling icin)
  activeJobs: Record<string, string>;
  addActiveJob: (convId: string, jobId: string) => void;
  removeActiveJob: (convId: string) => void;

  // Paper Portfolio
  paperPortfolio: PaperPortfolioState;
  setPortfolioData: (data: {
    wallet?: WalletSnapshot | null;
    positions?: PortfolioPosition[];
    trades?: PortfolioTrade[];
  }) => void;
  addOptimisticTrade: (clientRequestId: string, walletDelta: number) => void;
  removeOptimisticTrade: (clientRequestId: string) => void;
  setPortfolioLoading: (loading: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      watchlist: [],
      setWatchlist: (items) => set({ watchlist: items }),

      addToWatchlistOptimistic: (symbol, company) =>
        set((state) => ({
          watchlist: [...state.watchlist, { symbol, company, addedAt: new Date().toISOString() }],
        })),

      removeFromWatchlistOptimistic: (symbol) =>
        set((state) => ({
          watchlist: state.watchlist.filter((i) => i.symbol !== symbol),
        })),

      activeIndicators: [],
      setActiveIndicators: (indicators) => set({ activeIndicators: indicators }),

      lastToolAction: null,
      setLastToolAction: (action) => set({ lastToolAction: action }),

      activeJobs: {},
      addActiveJob: (convId, jobId) =>
        set((state) => ({
          activeJobs: { ...state.activeJobs, [convId]: jobId },
        })),
      removeActiveJob: (convId) =>
        set((state) => {
          if (!(convId in state.activeJobs)) return state;
          const next = { ...state.activeJobs };
          delete next[convId];
          return { activeJobs: next };
        }),

      // Paper Portfolio
      paperPortfolio: {
        walletSnapshot: null,
        openPositions: [],
        recentTrades: [],
        pendingOptimistic: [],
        isLoading: false,
      },

      setPortfolioData: (data) =>
        set((state) => ({
          paperPortfolio: {
            ...state.paperPortfolio,
            ...(data.wallet !== undefined ? { walletSnapshot: data.wallet } : {}),
            ...(data.positions !== undefined ? { openPositions: data.positions } : {}),
            ...(data.trades !== undefined ? { recentTrades: data.trades } : {}),
          },
        })),

      addOptimisticTrade: (clientRequestId, walletDelta) =>
        set((state) => ({
          paperPortfolio: {
            ...state.paperPortfolio,
            pendingOptimistic: [...state.paperPortfolio.pendingOptimistic, clientRequestId],
            walletSnapshot: state.paperPortfolio.walletSnapshot
              ? {
                  ...state.paperPortfolio.walletSnapshot,
                  cashBalance: state.paperPortfolio.walletSnapshot.cashBalance + walletDelta,
                  buyingPower: state.paperPortfolio.walletSnapshot.buyingPower + walletDelta,
                }
              : null,
          },
        })),

      removeOptimisticTrade: (clientRequestId) =>
        set((state) => ({
          paperPortfolio: {
            ...state.paperPortfolio,
            pendingOptimistic: state.paperPortfolio.pendingOptimistic.filter(
              (id) => id !== clientRequestId
            ),
          },
        })),

      setPortfolioLoading: (loading) =>
        set((state) => ({
          paperPortfolio: { ...state.paperPortfolio, isLoading: loading },
        })),
    }),
    {
      name: 'signalist-app-store',
      partialize: (state) => ({ activeJobs: state.activeJobs }), // Sadece activeJobs'u persist et
    }
  )
);
