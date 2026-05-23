'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAIEngine, type ActiveJobType, type NotificationType } from '../providers/AIEngineProvider';
import { Bell, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function NotificationBell() {
  const { notifications, activeJobs, unreadCount, markAsRead } = useAIEngine();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/5"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white transform translate-x-1/4 -translate-y-1/4">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#1a1b1e] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#1e1f23]">
            <h3 className="font-semibold text-white">AI Engine Status</h3>
            <span className="text-xs text-gray-400">{activeJobs.length} active jobs</span>
          </div>
          
          <div className="max-h-[400px] overflow-y-auto">
            {totalItems === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">
                No active jobs or notifications.
              </div>
            ) : (
              <div className="flex flex-col">
                {/* Active Jobs Section */}
                {activeJobs.length > 0 && (
                  <div className="p-2">
                    <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase">Running</div>
                    {activeJobs.map((job: ActiveJobType) => (
                      <div key={job._id} className="p-3 my-1 rounded-lg bg-blue-500/10 border border-blue-500/20">
                        <div className="flex items-start gap-3">
                          <Loader2 className="w-4 h-4 text-blue-400 animate-spin mt-0.5 shrink-0" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-blue-100">{job.title}</p>
                            <p className="text-xs text-blue-400/80 mt-1 capitalize">{job.status}...</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Notifications Section */}
                {notifications.length > 0 && (
                  <div className="p-2 border-t border-white/5">
                    <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase">Completed</div>
                    {notifications.map((notif: NotificationType) => (
                      <div 
                        key={notif._id} 
                        onClick={() => {
                          if (notif.status === 'unread') markAsRead(notif._id);
                        }}
                        className={`p-3 my-1 rounded-lg transition-colors cursor-pointer border ${notif.status === 'unread' ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-transparent border-transparent hover:bg-white/5'}`}
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
                                Sonucu Gör →
                              </Link>
                            )}
                          </div>
                          {notif.status === 'unread' && (
                            <div className="w-2 h-2 rounded-full bg-blue-500 mt-1 shrink-0" />
                          )}
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
