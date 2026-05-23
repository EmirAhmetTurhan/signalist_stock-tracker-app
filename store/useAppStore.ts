import { create } from 'zustand';

type WatchlistItem = { symbol: string; company: string; addedAt?: string };
type IndicatorState = { name: string; active: boolean };

interface AppState {
  // Watchlist
  watchlist: WatchlistItem[];
  setWatchlist: (items: WatchlistItem[]) => void;
  addToWatchlistOptimistic: (symbol: string, company: string) => void;
  removeFromWatchlistOptimistic: (symbol: string) => void;

  // Active indicators (AI'dan TA sayfasina aninda gecis)
  activeIndicators: string[];
  setActiveIndicators: (indicators: string[]) => void;

  // AI islem logu (hangi tool'un tetiklendigini takip)
  lastToolAction: { tool: string; payload: unknown } | null;
  setLastToolAction: (action: { tool: string; payload: unknown } | null) => void;

  // Global arka plan is takibi: convId -> jobId (sidebar spinner icin)
  activeJobs: Record<string, string>;
  addActiveJob: (convId: string, jobId: string) => void;
  removeActiveJob: (convId: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
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
}));
