'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getUserNotifications, markNotificationAsRead } from '@/lib/actions/notification.actions';
import { getActiveJobs } from '@/lib/actions/ai-job.actions';

export type NotificationType = {
  _id: string;
  type: string;
  title: string;
  message: string;
  status: 'unread' | 'read' | 'archived';
  actionUrl?: string;
  createdAt: string;
};

export type ActiveJobType = {
  _id: string;
  title: string;
  status: 'queued' | 'running';
  progress: number;
  jobId: string;
  createdAt: string;
};

interface AIEngineContextType {
  notifications: NotificationType[];
  activeJobs: ActiveJobType[];
  unreadCount: number;
  refresh: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
}

const AIEngineContext = createContext<AIEngineContextType | undefined>(undefined);

export function AIEngineProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationType[]>([]);
  const [activeJobs, setActiveJobs] = useState<ActiveJobType[]>([]);

  const fetchState = async () => {
    try {
      const [notifRes, jobsRes] = await Promise.all([
        getUserNotifications(20),
        getActiveJobs()
      ]);

      if (notifRes.success && notifRes.notifications) {
        setNotifications(notifRes.notifications);
      }
      if (jobsRes.success && jobsRes.activeJobs) {
        setActiveJobs(jobsRes.activeJobs);
      }
    } catch (error) {
      console.error('Failed to fetch AI Engine state:', error);
    }
  };

  useEffect(() => {
    fetchState();
    // Poll every 15 seconds
    const interval = setInterval(fetchState, 15000);
    return () => clearInterval(interval);
  }, []);

  const markAsRead = async (id: string) => {
    const res = await markNotificationAsRead(id);
    if (res.success) {
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, status: 'read' } : n));
    }
  };

  const unreadCount = notifications.filter(n => n.status === 'unread').length;

  return (
    <AIEngineContext.Provider value={{ notifications, activeJobs, unreadCount, refresh: fetchState, markAsRead }}>
      {children}
    </AIEngineContext.Provider>
  );
}

export function useAIEngine() {
  const context = useContext(AIEngineContext);
  if (context === undefined) {
    throw new Error('useAIEngine must be used within an AIEngineProvider');
  }
  return context;
}
