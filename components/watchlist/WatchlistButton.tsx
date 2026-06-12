'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Star, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { addToWatchlist, removeFromWatchlist } from '@/lib/actions/watchlist.actions';
import { useAppStore } from '@/store/useAppStore';

const WatchlistButton = ({
  symbol,
  company,
  isInWatchlist,
  showTrashIcon = false,
  type = 'button',
  onWatchlistChange,
  className,
  strokeWidth,
}: WatchlistButtonProps) => {
  const [loading, setLoading] = useState(false);
  const watchlist = useAppStore((s) => s.watchlist);
  const addOptimistic = useAppStore((s) => s.addToWatchlistOptimistic);
  const removeOptimistic = useAppStore((s) => s.removeFromWatchlistOptimistic);

  const isWatched = useMemo(
    () => watchlist.some((item) => item.symbol === symbol),
    [watchlist, symbol],
  );

  const handleToggle = async () => {
    if (loading) return;
    setLoading(true);

    const prev = isWatched;
    try {
      if (!prev) {
        addOptimistic(symbol, company);
        const res = await addToWatchlist(symbol, company);
        if (!res?.ok) {
          removeOptimistic(symbol);
          throw new Error(res?.error || 'Failed to add');
        }
        onWatchlistChange?.(symbol, true);
      } else {
        removeOptimistic(symbol);
        const res = await removeFromWatchlist(symbol);
        if (!res?.ok) {
          addOptimistic(symbol, company);
          throw new Error(res?.error || 'Failed to remove');
        }
        onWatchlistChange?.(symbol, false);
      }
    } catch (e) {
      console.error('Watchlist action error:', e);
    } finally {
      setLoading(false);
    }
  };

  if (type === 'icon') {
    return (
      <button
        type="button"
        onClick={handleToggle}
        disabled={loading}
        aria-pressed={isWatched}
        className={cn('watchlist-icon-btn', isWatched && 'watchlist-icon-added', className)}
        title={isWatched ? 'Remove from Watchlist' : 'Add to Watchlist'}
      >
        <span className="watchlist-icon">
          {showTrashIcon && isWatched ? (
            <Trash2 className="trash-icon" strokeWidth={strokeWidth} />
          ) : (
            <Star className="star-icon" fill={isWatched ? 'currentColor' : 'none'} strokeWidth={strokeWidth} />
          )}
        </span>
      </button>
    );
  }

  return (
    <Button
      type="button"
      onClick={handleToggle}
      disabled={loading}
      className={cn('watchlist-btn', isWatched && 'watchlist-remove')}
    >
      {showTrashIcon && isWatched ? (
        <Trash2 className="mr-2 h-4 w-4" />
      ) : (
        <Star className="mr-2 h-4 w-4" fill={isWatched ? 'currentColor' : 'none'} />
      )}
      {isWatched ? 'Remove from Watchlist' : 'Add to Watchlist'}
    </Button>
  );
};

export default WatchlistButton;
