'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useNotificationCenter, type ActiveJobType, type NotificationType } from '../providers/NotificationCenter';
import { Bell, Loader2, CheckCircle2, AlertCircle, Clock, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

export default function NotificationBell() {
  const { notifications, activeJobs, unreadCount, markAsRead, refresh } = useNotificationCenter();
  const [isOpen, setIsOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refresh();
    setIsRefreshing(false);
  };

  const handleClearAll = async () => {
    setIsClearing(true);
    try {
      const { clearAllNotifications } = await import('@/lib/actions/notification.actions');
      const res = await clearAllNotifications();
      if (res.success) {
        await refresh();
        toast.success('All notifications cleared');
      } else {
        toast.error(res.error || 'Failed to clear notifications');
      }
    } catch {
      toast.error('Failed to clear notifications');
    } finally {
      setIsClearing(false);
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const totalItems = activeJobs.length + notifications.length;

  // Separate running and queued jobs
  const runningJobs = activeJobs.filter(j => j.status === 'running');
  const queuedJobs = activeJobs.filter(j => j.status === 'queued');

  // Check if any deep discovery jobs are running
  const hasDeepDiscovery = activeJobs.some(j => j.title?.toLowerCase().includes('deep discovery') || j.title?.toLowerCase().includes('discovery'));

  // Compute badge display
  const badgeCount = activeJobs.length > 0 ? activeJobs.length : unreadCount;
  const badgeColor = hasDeepDiscovery ? 'bg-violet-500' : activeJobs.length > 0 ? 'bg-blue-500' : 'bg-red-500';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/5"
      >
        <Bell className="w-5 h-5" />
        {/* Show active job count (not unread count) when jobs are running */}
        {(unreadCount > 0 || activeJobs.length > 0) && (
          <span className={`absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white transform translate-x-1/4 -translate-y-1/4 ${badgeColor}`}>
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#1a1b1e] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#1e1f23]">
            <h3 className="font-semibold text-white flex items-center gap-2">
              {hasDeepDiscovery ? (
                <>
                  <Sparkles className="w-4 h-4 text-violet-400" />
                  System Status
                </>
              ) : (
                'Notifications'
              )}
            </h3>
            <div className="flex items-center gap-3">
              <button
                onClick={handleClearAll}
                disabled={isClearing || totalItems === 0}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Clear all"
              >
                <Trash2 className={`w-3.5 h-3.5 ${isClearing ? 'animate-pulse text-red-400' : ''}`} />
              </button>
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
              </button>
              <span className="text-xs text-gray-500">
                {activeJobs.length > 0
                  ? `${activeJobs.length} active`
                  : notifications.length > 0
                    ? `${notifications.length} items`
                    : ''}
              </span>
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {totalItems === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">
                {isClearing ? 'Clearing...' : 'No active jobs or notifications.'}
              </div>
            ) : (
              <div className="flex flex-col">
                {/* ─── Running Jobs Section ─── */}
                {runningJobs.length > 0 && (
                  <div className="p-2">
                    <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
                      Deep Discovery — Running
                    </div>
                    {runningJobs.map((job: ActiveJobType) => (
                      <div key={job._id} className="p-3 my-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 space-y-2">
                        {/* Header: Icon + Title */}
                        <div className="flex items-start gap-3">
                          <Loader2 className="w-4 h-4 text-violet-400 animate-spin mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-violet-100 truncate">{job.title}</p>
                            {job.currentPhase && (
                              <span className="text-xs text-violet-400/80">Phase {job.currentPhase}/5</span>
                            )}
                          </div>
                          {/* Percentage Badge */}
                          <span className="text-xs font-semibold text-amber-400 shrink-0">{job.progress}%</span>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full h-1.5 bg-violet-900/50 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-violet-500 to-amber-400 rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${Math.max(3, job.progress)}%` }}
                          />
                        </div>

                        {/* Phase Detail */}
                        {job.phaseDetail && (
                          <div className="flex items-center gap-2">
                            <div className="w-1 h-1 bg-violet-400 rounded-full animate-pulse" />
                            <p className="text-[11px] text-violet-400/70 truncate">{job.phaseDetail}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* ─── Queued Jobs Section ─── */}
                {queuedJobs.length > 0 && (
                  <div className="p-2 border-t border-white/5">
                    <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      Deep Discovery — Queued
                    </div>
                    {queuedJobs.map((job: ActiveJobType) => (
                      <div key={job._id} className="p-3 my-1.5 rounded-lg bg-gray-800/50 border border-gray-700/50">
                        <div className="flex items-start gap-3">
                          <Clock className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-300">{job.title}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Waiting — will start when previous job completes
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ─── Notifications Section ─── */}
                {notifications.length > 0 && (
                  <div className={`p-2 ${activeJobs.length > 0 ? 'border-t border-white/5' : ''}`}>
                    <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase">Completed</div>
                    {notifications.map((notif: NotificationType) => (
                      <div
                        key={notif._id}
                        onClick={() => {
                          if (notif.status === 'unread') markAsRead(notif._id);
                        }}
                        className={`group relative p-3 my-1 rounded-lg transition-colors cursor-pointer border ${notif.status === 'unread' ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-transparent border-transparent hover:bg-white/5'}`}
                      >
                        <div className="flex items-start gap-3">
                          {notif.type.includes('failed') ? (
                            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                          )}
                          <div className="flex-1">
                            <p className={`text-sm font-medium ${notif.status === 'unread' ? 'text-white' : 'text-gray-300'}`}>
                              {notif.title}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">{notif.message}</p>
                            {notif.actionUrl && (
                              <Link
                                href={notif.actionUrl}
                                onClick={() => setIsOpen(false)}
                                className="inline-block mt-2 text-xs text-blue-400 hover:text-blue-300"
                              >
                                View Result →
                              </Link>
                            )}
                          </div>
                          {notif.status === 'unread' && (
                            <div className="w-2 h-2 rounded-full bg-blue-500 mt-1 shrink-0" />
                          )}
                          <button
                            onClick={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              try {
                                const { deleteNotification } = await import('@/lib/actions/notification.actions');
                                await deleteNotification(notif._id);
                                await refresh();
                              } catch (err) {
                                toast.error('Failed to delete notification');
                              }
                            }}
                            className="absolute right-2 bottom-2 p-1.5 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity rounded-md hover:bg-red-400/10"
                            title="Delete notification"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
