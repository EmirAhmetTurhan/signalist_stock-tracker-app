'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
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
    currentPhase?: number;
    phaseDetail?: string;
    createdAt: string;
};

interface NotificationCenterContextType {
    notifications: NotificationType[];
    activeJobs: ActiveJobType[];
    unreadCount: number;
    refresh: () => Promise<void>;
    markAsRead: (id: string) => Promise<void>;
}

const NotificationCenterContext = createContext<NotificationCenterContextType | undefined>(undefined);

export function NotificationCenter({ children }: { children: ReactNode }) {
    const [notifications, setNotifications] = useState<NotificationType[]>([]);
    const [activeJobs, setActiveJobs] = useState<ActiveJobType[]>([]);
    const lastRefreshRef = useRef(0);
    const pendingRefreshRef = useRef(false);

    const fetchState = useCallback(async () => {
        // Debounce: skip if a refresh happened within the last 5 seconds
        const now = Date.now();
        if (now - lastRefreshRef.current < 5000) {
            // If there's already a pending refresh, skip entirely
            if (pendingRefreshRef.current) return;
            // Schedule a delayed refresh at the 5s mark
            pendingRefreshRef.current = true;
            setTimeout(() => {
                pendingRefreshRef.current = false;
                lastRefreshRef.current = 0; // Reset so the next call goes through
                fetchState();
            }, 5000 - (now - lastRefreshRef.current));
            return;
        }

        lastRefreshRef.current = now;
        try {
            const [notifRes, jobsRes] = await Promise.all([
                getUserNotifications(20),
                getActiveJobs()
            ]);

            if (notifRes.success && notifRes.notifications) {
                // Auto-cleanup: filter out notifications that are both 'read' AND older than 5 minutes.
                // This prevents the "Completed" section from accumulating stale entries.
                const FIVE_MIN_MS = 5 * 60 * 1000;
                const now = Date.now();
                const freshNotifications = notifRes.notifications.filter((n: NotificationType) => {
                    if (n.status !== 'read') return true; // keep unread notifications
                    const age = now - new Date(n.createdAt).getTime();
                    return age < FIVE_MIN_MS; // keep read notifications only if < 5 min old
                });
                setNotifications(freshNotifications);
            }
            if (jobsRes.success && jobsRes.activeJobs) {
                setActiveJobs(jobsRes.activeJobs);
            }
        } catch (error) {
            console.error('Failed to fetch notification center state:', error);
        }
    }, []);

    useEffect(() => {
        fetchState();
        // Poll every 15 seconds
        const interval = setInterval(fetchState, 15000);
        return () => clearInterval(interval);
    }, [fetchState]);

    const markAsRead = async (id: string) => {
        const res = await markNotificationAsRead(id);
        if (res.success) {
            setNotifications(prev => prev.map(n => n._id === id ? { ...n, status: 'read' } : n));
        }
    };

    const unreadCount = notifications.filter(n => n.status === 'unread').length;

    return (
        <NotificationCenterContext.Provider value={{ notifications, activeJobs, unreadCount, refresh: fetchState, markAsRead }}>
            {children}
        </NotificationCenterContext.Provider>
    );
}

export function useNotificationCenter() {
    const context = useContext(NotificationCenterContext);
    if (context === undefined) {
        throw new Error('useNotificationCenter must be used within a NotificationCenter');
    }
    return context;
}
