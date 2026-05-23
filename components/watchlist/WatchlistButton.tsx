'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Star, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { addToWatchlist, removeFromWatchlist } from '@/lib/actions/watchlist.actions';

const WatchlistButton = ({
  symbol,
  company,
  isInWatchlist,
  showTrashIcon = false,
  type = 'button',
  onWatchlistChange,
}: WatchlistButtonProps) => {
  const [added, setAdded] = useState<boolean>(!!isInWatchlist);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    if (loading) return;
    setLoading(true);

    const prev = added;
    // Optimistic toggle
    setAdded(!prev);
    try {
      if (!prev) {
        const res = await addToWatchlist(symbol, company);
        if (!res?.ok) throw new Error(res?.error || 'Failed to add');
        onWatchlistChange?.(symbol, true);
      } else {
        const res = await removeFromWatchlist(symbol);
        if (!res?.ok) throw new Error(res?.error || 'Failed to remove');
        onWatchlistChange?.(symbol, false);
      }
    } catch (e) {
      // Revert optimistic update on error
      setAdded(prev);
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
        aria-pressed={added}
        className={cn('watchlist-icon-btn', added && 'watchlist-icon-added')}
        title={added ? 'Remove from Watchlist' : 'Add to Watchlist'}
      >
        <span className="watchlist-icon">
          {showTrashIcon && added ? (
            <Trash2 className="trash-icon" />
          ) : (
            <Star className="star-icon" fill={added ? 'currentColor' : 'none'} />
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
      className={cn('watchlist-btn', added && 'watchlist-remove')}
    >
      {showTrashIcon && added ? (
        <Trash2 className="mr-2 h-4 w-4" />
      ) : (
        <Star className="mr-2 h-4 w-4" fill={added ? 'currentColor' : 'none'} />
      )}
      {added ? 'Remove from Watchlist' : 'Add to Watchlist'}
    </Button>
  );
};

export default WatchlistButton;
