'use client';

import { useState } from 'react';
import { deleteAlertAction, updateAlertThresholdAction } from '@/lib/actions/alerts.actions';

type AlertActionsProps = {
  alertId: string;
  threshold: number;
};

export default function AlertActions({ alertId, threshold }: AlertActionsProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(Number(threshold || 0).toString());

  return (
    <div className="flex items-center gap-2">
      {editing ? (
        <form action={updateAlertThresholdAction} className="flex items-center gap-2">
          <input type="hidden" name="alertId" value={alertId} />
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">$</span>
            <input
              name="threshold"
              type="number"
              step="0.01"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-28 rounded-md bg-[#0f0f0f] border border-gray-700 pl-6 pr-2 py-1.5 text-gray-100 text-sm focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="px-2.5 py-1.5 rounded-md bg-yellow-500 text-black text-xs font-medium hover:brightness-95"
            title="Save"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="px-2.5 py-1.5 rounded-md bg-gray-800 text-gray-200 text-xs hover:bg-gray-700"
          >
            Cancel
          </button>
        </form>
      ) : (
        <>
          <form
            action={deleteAlertAction}
            onSubmit={(e) => {
              const ok = window.confirm('Delete this alert?');
              if (!ok) e.preventDefault();
            }}
          >
            <input type="hidden" name="alertId" value={alertId} />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="p-1.5 rounded hover:bg-gray-700 text-gray-300"
                title="Edit threshold"
              >
                {/* Pencil icon */}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <path d="M21.7 7.04a1 1 0 0 0 0-1.41l-3.33-3.33a1 1 0 0 0-1.41 0L4 14.26V18h3.74L21.7 7.04ZM6.59 16H6v-.59l9.96-9.96.59.59L6.59 16Z" />
                </svg>
              </button>
              <button
                type="submit"
                className="p-1.5 rounded hover:bg-gray-700 text-gray-300"
                title="Delete alert"
              >
                {/* Trash icon */}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <path d="M9 3a1 1 0 0 0-1 1v1H4.5a1 1 0 1 0 0 2H5v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7h.5a1 1 0 1 0 0-2H16V4a1 1 0 0 0-1-1H9Zm2 4a1 1 0 1 0-2 0v10a1 1 0 1 0 2 0V7Zm4 0a1 1 0 1 0-2 0v10a1 1 0 1 0 2 0V7Z" />
                </svg>
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
