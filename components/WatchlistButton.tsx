'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Star } from 'lucide-react'

const WatchlistButton = ({
  symbol,
  company,
  isInWatchlist,
  showTrashIcon,
  type = 'button',
  onWatchlistChange,
}: WatchlistButtonProps) => {
  const [added, setAdded] = useState<boolean>(!!isInWatchlist)

  const label = useMemo(
    () => (added ? 'Remove from Watchlist' : 'Add to Watchlist'),
    [added]
  )

  const toggle = () => {
    const next = !added
    setAdded(next)
    onWatchlistChange?.(symbol, next)
  }

  if (type === 'icon') {
    return (
      <button
        type="button"
        aria-label={label}
        onClick={toggle}
        className={cn('watchlist-icon-btn', added && 'watchlist-icon-added')}
        title={label}
      >
        <span className="watchlist-icon">
          <Star className="star-icon" />
        </span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn('watchlist-btn', added && 'watchlist-remove')}
    >
      {label}
    </button>
  )
}

export default WatchlistButton
