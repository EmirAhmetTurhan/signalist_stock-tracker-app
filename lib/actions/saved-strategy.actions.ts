'use server';

import { connectToDatabase } from '@/database/mongoose';
import SavedStrategy from '@/database/models/saved-strategy.model';
import { revalidatePath } from 'next/cache';
import type { StrategyMode } from '@/lib/ta/types';
import type { DiscoveryStrategyResult } from '@/database/models/report.model';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';

// ============================================================
// Create Saved Strategy
// ============================================================

export interface CreateSavedStrategyInput {
    userId: string;
    name: string;
    indicators: string[];
    mode?: StrategyMode;
    lookForward?: number;
    discoveredParams?: Record<string, number>;
    discoveredWinRate?: number;
    discoveredTotalSignals?: number;
    discoveredSymbol?: string;
    discoveredInterval?: string;
    // Multi-metric discovery fields
    discoveredProfitFactor?: number;
    discoveredSharpeRatio?: number;
    discoveredAvgWin?: number;
    discoveredAvgLoss?: number;
    discoveredMaxDrawdown?: number;
    discoveredTotalReturn?: number;
    discoveredRegimeBreakdown?: Record<string, {
        winRate: number;
        totalSignals: number;
        wins: number;
        avgReturn: number;
        totalReturn: number;
    }>;
    pinned?: boolean;
    sourceReportId?: string;
    isDiscovered?: boolean;
}

export async function createSavedStrategy(input: CreateSavedStrategyInput) {
    if (!input.userId) return { success: false, error: 'User ID is required.' };
    if (!input.name?.trim()) return { success: false, error: 'Strategy name is required.' };
    if (!input.indicators?.length) return { success: false, error: 'At least one indicator is required.' };

    try {
        await connectToDatabase();

        const newStrategy = await SavedStrategy.create({
            userId: input.userId,
            name: input.name.trim(),
            indicators: input.indicators,
            mode: input.mode ?? 'all',
            lookForward: input.lookForward ?? 14,
            discoveredParams: input.discoveredParams ?? null,
            discoveredWinRate: input.discoveredWinRate ?? null,
            discoveredTotalSignals: input.discoveredTotalSignals ?? null,
            discoveredSymbol: input.discoveredSymbol ?? null,
            discoveredInterval: input.discoveredInterval ?? null,
            // Multi-metric discovery fields
            discoveredProfitFactor: input.discoveredProfitFactor ?? null,
            discoveredSharpeRatio: input.discoveredSharpeRatio ?? null,
            discoveredAvgWin: input.discoveredAvgWin ?? null,
            discoveredAvgLoss: input.discoveredAvgLoss ?? null,
            discoveredMaxDrawdown: input.discoveredMaxDrawdown ?? null,
            discoveredTotalReturn: input.discoveredTotalReturn ?? null,
            discoveredRegimeBreakdown: input.discoveredRegimeBreakdown ?? null,
            pinned: input.pinned ?? false,
            sourceReportId: input.sourceReportId ?? null,
            isDiscovered: input.isDiscovered ?? false,
        });

        revalidatePath('/ta');

        return { success: true, strategyId: newStrategy._id.toString() };
    } catch (e) {
        console.error('[SavedStrategyActions] create error:', e);
        return { success: false, error: 'Failed to save strategy.' };
    }
}

// ============================================================
// Get All Saved Strategies for a User
// ============================================================

export async function getSavedStrategies(userId: string) {
    if (!userId) return { success: false, data: [] };

    try {
        await connectToDatabase();

        const strategies = await SavedStrategy.find({ userId })
            .sort({ createdAt: -1 })
            .lean();

        const formatted = strategies.map(s => ({
            id: s._id.toString(),
            userId: s.userId,
            name: s.name,
            indicators: s.indicators,
            mode: s.mode,
            lookForward: s.lookForward,
            discoveredParams: s.discoveredParams ?? null,
            discoveredWinRate: s.discoveredWinRate ?? null,
            discoveredTotalSignals: s.discoveredTotalSignals ?? null,
            discoveredSymbol: s.discoveredSymbol ?? null,
            discoveredInterval: s.discoveredInterval ?? null,
            // Multi-metric discovery fields
            discoveredProfitFactor: s.discoveredProfitFactor ?? null,
            discoveredSharpeRatio: s.discoveredSharpeRatio ?? null,
            discoveredAvgWin: s.discoveredAvgWin ?? null,
            discoveredAvgLoss: s.discoveredAvgLoss ?? null,
            discoveredMaxDrawdown: s.discoveredMaxDrawdown ?? null,
            discoveredTotalReturn: s.discoveredTotalReturn ?? null,
            discoveredRegimeBreakdown: s.discoveredRegimeBreakdown ?? null,
            pinned: s.pinned ?? false,
            sourceReportId: s.sourceReportId ?? null,
            isDiscovered: s.isDiscovered ?? false,
            createdAt: s.createdAt?.toISOString?.() ?? null,
            updatedAt: s.updatedAt?.toISOString?.() ?? null,
        }));

        return { success: true, data: formatted };
    } catch (e) {
        console.error('[SavedStrategyActions] get error:', e);
        return { success: false, error: 'Failed to load strategies.' };
    }
}

// ============================================================
// Get Single Saved Strategy by ID
// ============================================================

export async function getSavedStrategyById(userId: string, id: string) {
    if (!userId || !id) return { success: false, error: 'User ID and Strategy ID are required.' };

    try {
        await connectToDatabase();

        const strategy = await SavedStrategy.findOne({ _id: id, userId }).lean();

        if (!strategy) return { success: false, error: 'Strategy not found.' };

        return {
            success: true,
            data: {
                id: strategy._id.toString(),
                userId: strategy.userId,
                name: strategy.name,
                indicators: strategy.indicators,
                mode: strategy.mode,
                lookForward: strategy.lookForward,
                discoveredParams: strategy.discoveredParams ?? null,
                discoveredWinRate: strategy.discoveredWinRate ?? null,
                discoveredTotalSignals: strategy.discoveredTotalSignals ?? null,
                discoveredSymbol: strategy.discoveredSymbol ?? null,
                discoveredInterval: strategy.discoveredInterval ?? null,
                // Multi-metric discovery fields
                discoveredProfitFactor: strategy.discoveredProfitFactor ?? null,
                discoveredSharpeRatio: strategy.discoveredSharpeRatio ?? null,
                discoveredAvgWin: strategy.discoveredAvgWin ?? null,
                discoveredAvgLoss: strategy.discoveredAvgLoss ?? null,
                discoveredMaxDrawdown: strategy.discoveredMaxDrawdown ?? null,
                discoveredTotalReturn: strategy.discoveredTotalReturn ?? null,
                discoveredRegimeBreakdown: strategy.discoveredRegimeBreakdown ?? null,
                createdAt: strategy.createdAt?.toISOString?.() ?? null,
                updatedAt: strategy.updatedAt?.toISOString?.() ?? null,
            },
        };
    } catch (e) {
        console.error('[SavedStrategyActions] getById error:', e);
        return { success: false, error: 'Failed to load strategy.' };
    }
}

// ============================================================
// Update Saved Strategy
// ============================================================

export interface UpdateSavedStrategyInput {
    name?: string;
    indicators?: string[];
    mode?: StrategyMode;
    lookForward?: number;
}

export async function updateSavedStrategy(userId: string, id: string, input: UpdateSavedStrategyInput) {
    if (!userId || !id) return { success: false, error: 'User ID and Strategy ID are required.' };

    try {
        await connectToDatabase();

        const updateData: Record<string, unknown> = {};
        if (input.name !== undefined) updateData.name = input.name.trim();
        if (input.indicators !== undefined) updateData.indicators = input.indicators;
        if (input.mode !== undefined) updateData.mode = input.mode;
        if (input.lookForward !== undefined) updateData.lookForward = input.lookForward;

        const result = await SavedStrategy.findOneAndUpdate(
            { _id: id, userId },
            { $set: updateData },
            { new: true }
        );

        if (!result) return { success: false, error: 'Strategy not found or access denied.' };

        revalidatePath('/ta');

        return { success: true };
    } catch (e) {
        console.error('[SavedStrategyActions] update error:', e);
        return { success: false, error: 'Failed to update strategy.' };
    }
}

// ============================================================
// Delete Saved Strategy
// ============================================================

export async function deleteSavedStrategy(userId: string, id: string) {
    if (!userId || !id) return { success: false, error: 'User ID and Strategy ID are required.' };

    try {
        await connectToDatabase();

        const result = await SavedStrategy.findOneAndDelete({ _id: id, userId });

        if (!result) return { success: false, error: 'Strategy not found or access denied.' };

        revalidatePath('/ta');

        return { success: true };
    } catch (e) {
        console.error('[SavedStrategyActions] delete error:', e);
        return { success: false, error: 'Failed to delete strategy.' };
    }
}

// ============================================================
// Add Discovered Strategy (from Archive report)
// ============================================================

/**
 * Import a discovery result from an Archive report as a SavedStrategy.
 * Auto-generates name from the indicator combo, sets isDiscovered: true,
 * and links back to the source report via sourceReportId.
 * User session is resolved internally via auth().
 */
export async function addDiscoveredStrategy(
    reportId: string,
    strategy: DiscoveryStrategyResult,
    symbol: string,
    interval: string,
) {
    if (!reportId) return { success: false, error: 'Report ID is required.' };
    if (!strategy?.combo?.length) return { success: false, error: 'Invalid discovery strategy.' };

    try {
        const session = await auth.api.getSession({ headers: await headers() });
        const userId = session?.user?.id;
        if (!userId) return { success: false, error: 'Unauthorized' };

        await connectToDatabase();

        const indicatorNames = strategy.combo.map(k => k.toUpperCase()).join(' + ');
        const name = `Discovered -- ${indicatorNames}`;

        const newStrategy = await SavedStrategy.create({
            userId,
            name,
            indicators: strategy.combo,
            mode: 'majority',
            lookForward: 14,
            discoveredParams: strategy.bestParams ?? null,
            discoveredWinRate: strategy.validatedWinRate ?? strategy.bestWinRate ?? null,
            discoveredTotalSignals: strategy.totalSignals ?? null,
            discoveredSymbol: symbol ?? null,
            discoveredInterval: interval ?? null,
            // Multi-metric discovery fields
            discoveredProfitFactor: strategy.profitFactor ?? null,
            discoveredSharpeRatio: strategy.sharpeRatio ?? null,
            discoveredAvgWin: strategy.avgWin ?? null,
            discoveredAvgLoss: strategy.avgLoss ?? null,
            discoveredMaxDrawdown: strategy.maxDrawdown ?? null,
            discoveredTotalReturn: strategy.totalReturn ?? null,
            discoveredRegimeBreakdown: strategy.regimeBreakdown ?? null,
            pinned: false,
            sourceReportId: reportId,
            isDiscovered: true,
        });

        revalidatePath('/ta');
        revalidatePath('/archive/reports/[id]', 'page');

        return {
            success: true,
            strategyId: newStrategy._id.toString(),
            name,
        };
    } catch (e) {
        console.error('[SavedStrategyActions] addDiscoveredStrategy error:', e);
        return { success: false, error: 'Failed to add discovered strategy.' };
    }
}

// ============================================================
// Toggle Pin Strategy
// ============================================================

/**
 * Flip the pinned boolean on a saved strategy.
 * Pinned strategies appear first in the UI.
 */
export async function togglePinStrategy(userId: string, strategyId: string) {
    if (!userId || !strategyId) {
        return { success: false, error: 'User ID and Strategy ID are required.' };
    }

    try {
        await connectToDatabase();

        const strategy = await SavedStrategy.findOne({ _id: strategyId, userId });
        if (!strategy) {
            return { success: false, error: 'Strategy not found or access denied.' };
        }

        const updated = await SavedStrategy.findOneAndUpdate(
            { _id: strategyId, userId },
            { $set: { pinned: !strategy.pinned } },
            { new: true },
        );

        if (!updated) {
            return { success: false, error: 'Failed to toggle pin.' };
        }

        revalidatePath('/ta');

        return { success: true, pinned: updated.pinned };
    } catch (e) {
        console.error('[SavedStrategyActions] togglePinStrategy error:', e);
        return { success: false, error: 'Failed to toggle pin.' };
    }
}

// ============================================================
// Rename Strategy
// ============================================================

/**
 * Update the display name of a saved strategy.
 */
export async function renameStrategy(userId: string, strategyId: string, newName: string) {
    if (!userId || !strategyId) {
        return { success: false, error: 'User ID and Strategy ID are required.' };
    }
    if (!newName?.trim()) {
        return { success: false, error: 'Strategy name is required.' };
    }

    try {
        await connectToDatabase();

        const result = await SavedStrategy.findOneAndUpdate(
            { _id: strategyId, userId },
            { $set: { name: newName.trim() } },
            { new: true },
        );

        if (!result) {
            return { success: false, error: 'Strategy not found or access denied.' };
        }

        revalidatePath('/ta');

        return { success: true };
    } catch (e) {
        console.error('[SavedStrategyActions] renameStrategy error:', e);
        return { success: false, error: 'Failed to rename strategy.' };
    }
}
