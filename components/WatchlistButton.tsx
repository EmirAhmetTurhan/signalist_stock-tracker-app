'use client'

import { useState } from 'react'
import { Star, StarOff, Trash2 } from 'lucide-react'

const WatchlistButton = ({
  symbol,
  company,
  isInWatchlist,
  showTrashIcon = false,
  type = 'button',
  onWatchlistChange,
}: WatchlistButtonProps) => {
  const [added, setAdded] = useState<boolean>(!!isInWatchlist)

  const toggle = () => {
    const next = !added
    setAdded(next)
    onWatchlistChange?.(symbol, next)
  }

  if (type === 'icon') {
    return (
      <button
        type="button"
        aria-label={added ? 'Remove from watchlist' : 'Add to watchlist'}
        title={added ? 'Remove from watchlist' : 'Add to watchlist'}
        onClick={toggle}
        className={`watchlist-icon-btn ${added ? 'watchlist-icon-added' : ''}`}
      >
        <span className="watchlist-icon">
          {added ? <Star className="star-icon" /> : <StarOff className="star-icon" />}
        </span>
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        className={`watchlist-btn ${added ? '' : ''}`}
      >
        {added ? 'Remove from Watchlist' : 'Add to Watchlist'}
      </button>
      {showTrashIcon && (
        <button
          type="button"
          aria-label="Remove"
          title="Remove"
          onClick={() => {
            if (added) toggle()
          }}
          className="watchlist-icon-btn"
        >
          <Trash2 className="trash-icon" />
        </button>
      )}
    </div>
  )
}

export default WatchlistButton
