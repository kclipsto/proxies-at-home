/**
 * useShareSync - Auto-sync hook for shared projects
 * 
 * Debounces card/settings changes and auto-pushes to server if project was previously shared.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useProjectStore, useSettingsStore } from '@/store';
import { createShare, serializeSettings, type SettingsInput } from '@/helpers/shareHelper';
import { useShallow } from 'zustand/react/shallow';

// Debounce delay for auto-sync (30 seconds after last change)
const SYNC_DEBOUNCE_MS = 30_000;

export type SyncStatus = 'idle' | 'pending' | 'syncing' | 'synced' | 'error';

export interface UseShareSyncResult {
    syncStatus: SyncStatus;
    lastSyncedAt: number | null;
    syncNow: () => Promise<void>;
}

export function useShareSync(): UseShareSyncResult {
    const currentProjectId = useProjectStore((state) => state.currentProjectId);

    // Get current project to check if it was shared
    const project = useLiveQuery(async () => {
        if (!currentProjectId) return null;
        return db.projects.get(currentProjectId);
    }, [currentProjectId]);

    // Get cards for the current project
    const cardsQuery = useLiveQuery(async () => {
        if (!currentProjectId) return [];
        return db.cards.where('projectId').equals(currentProjectId).toArray();
    }, [currentProjectId]);
    const cards = useMemo(() => cardsQuery ?? [], [cardsQuery]);

    // Get settings for sharing
    const settings = useSettingsStore(useShallow((state) => ({
        pageSizePreset: state.pageSizePreset,
        columns: state.columns,
        rows: state.rows,
        dpi: state.dpi,
        bleedEdge: state.bleedEdge,
        bleedEdgeWidth: state.bleedEdgeWidth,
        withBleedSourceAmount: state.withBleedSourceAmount,
        withBleedTargetMode: state.withBleedTargetMode,
        withBleedTargetAmount: state.withBleedTargetAmount,
        noBleedTargetMode: state.noBleedTargetMode,
        noBleedTargetAmount: state.noBleedTargetAmount,
        darkenMode: state.darkenMode,
        darkenContrast: state.darkenContrast,
        darkenEdgeWidth: state.darkenEdgeWidth,
        darkenAmount: state.darkenAmount,
        darkenBrightness: state.darkenBrightness,
        darkenAutoDetect: state.darkenAutoDetect,
        perCardGuideStyle: state.perCardGuideStyle,
        guideColor: state.guideColor,
        guideWidth: state.guideWidth,
        guidePlacement: state.guidePlacement,
        cutGuideLengthMm: state.cutGuideLengthMm,
        cutLineStyle: state.cutLineStyle,
        cardSpacingMm: state.cardSpacingMm,
        cardPositionX: state.cardPositionX,
        cardPositionY: state.cardPositionY,
        useCustomBackOffset: state.useCustomBackOffset,
        cardBackPositionX: state.cardBackPositionX,
        cardBackPositionY: state.cardBackPositionY,
        preferredArtSource: state.preferredArtSource,
        globalLanguage: state.globalLanguage,
        autoImportTokens: state.autoImportTokens,
        mpcFuzzySearch: state.mpcFuzzySearch,
        showProcessingToasts: state.showProcessingToasts,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
        filterManaCost: state.filterManaCost,
        filterColors: state.filterColors,
        filterTypes: state.filterTypes,
        filterCategories: state.filterCategories,
        filterFeatures: state.filterFeatures,
        filterMatchType: state.filterMatchType,
        exportMode: state.exportMode,
        decklistSortAlpha: state.decklistSortAlpha,
    } as SettingsInput)));

    const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
    const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);
    const lastSyncHashRef = useRef<string>('');

    // Generate a hash of the current state to detect changes
    const generateStateHash = useCallback(() => {
        if (!cards || cards.length === 0) return '';
        const cardData = cards.map(c => `${c.uuid}:${c.imageId}:${c.order}:${c.name}`).join('|');
        const settingsData = JSON.stringify(serializeSettings(settings));
        return `${cardData}::${settingsData}`;
    }, [cards, settings]);

    // Perform sync
    const syncNow = useCallback(async () => {
        if (!currentProjectId || !project?.shareId || cards.length === 0) {
            return;
        }

        setSyncStatus('syncing');
        try {
            await createShare(cards, settings, currentProjectId);
            const now = Date.now();
            await db.projects.update(currentProjectId, { lastSharedAt: now });
            setLastSyncedAt(now);
            lastSyncHashRef.current = generateStateHash();
            setSyncStatus('synced');

            // Reset to idle after 3 seconds
            setTimeout(() => {
                setSyncStatus((current) => current === 'synced' ? 'idle' : current);
            }, 3000);
        } catch (err) {
            console.error('[ShareSync] Auto-sync failed:', err);
            setSyncStatus('error');

            // Reset to idle after 5 seconds
            setTimeout(() => {
                setSyncStatus((current) => current === 'error' ? 'idle' : current);
            }, 5000);
        }
    }, [currentProjectId, project?.shareId, cards, settings, generateStateHash]);

    // Watch for changes and debounce sync
    useEffect(() => {
        // Only auto-sync if project has been shared before
        if (!project?.shareId || !currentProjectId) {
            setSyncStatus('idle');
            return;
        }

        // Check if state actually changed
        const currentHash = generateStateHash();
        if (currentHash === lastSyncHashRef.current || currentHash === '') {
            return;
        }

        // State changed - start debounce timer
        setSyncStatus('pending');

        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(() => {
            syncNow();
        }, SYNC_DEBOUNCE_MS);

        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [project?.shareId, currentProjectId, generateStateHash, syncNow]);

    // Initialize lastSyncedAt from project
    useEffect(() => {
        if (project?.lastSharedAt) {
            setLastSyncedAt(project.lastSharedAt);
            lastSyncHashRef.current = generateStateHash();
        }
    }, [project?.lastSharedAt, generateStateHash]);

    return {
        syncStatus,
        lastSyncedAt,
        syncNow,
    };
}
