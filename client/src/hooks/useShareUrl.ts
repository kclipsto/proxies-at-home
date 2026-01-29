/**
 * useShareUrl Hook
 * 
 * Detects ?share=xxx query parameter on mount and loads the shared deck.
 * Clears the parameter after successful load.
 */

import { useEffect, useState, useRef } from 'react';
import { db } from '@/db';
import { loadShare, deserializeForImport, calculateStateHash, type ShareData, type ShareSettings, type SettingsInput } from '../helpers/shareHelper';
import { useSettingsStore } from '../store/settings';
import { ImportOrchestrator } from '../helpers/ImportOrchestrator';
import type { ImportIntent } from '../helpers/importParsers';
import { useToastStore } from '../store/toast';
import { useProjectStore } from '../store';
import { debugLog } from '@/helpers/debug';

export interface UseShareUrlResult {
    isLoading: boolean;
    error: string | null;
    shareData: ShareData | null;
}

/**
 * Get the share ID from the URL, if present
 */
function getShareIdFromUrl(): string | null {
    const params = new URLSearchParams(window.location.search);
    return params.get('share');
}

/**
 * Remove the share parameter from the URL without reloading
 */
function clearShareFromUrl(): void {
    const url = new URL(window.location.href);
    url.searchParams.delete('share');
    window.history.replaceState({}, '', url.toString());
}

/**
 * Apply share settings to the settings store
 */
function applyShareSettings(settings: ShareSettings): void {
    const store = useSettingsStore.getState();

    // Layout
    if (settings.pr) store.setPageSizePreset(settings.pr as Parameters<typeof store.setPageSizePreset>[0]);
    if (settings.c !== undefined) store.setColumns(settings.c);
    if (settings.r !== undefined) store.setRows(settings.r);
    if (settings.dpi !== undefined) store.setDpi(settings.dpi);

    // Bleed
    if (settings.bl !== undefined) store.setBleedEdge(settings.bl);
    if (settings.blMm !== undefined) store.setBleedEdgeWidth(settings.blMm);
    if (settings.wbSrc !== undefined) store.setWithBleedSourceAmount(settings.wbSrc);
    if (settings.wbTm) store.setWithBleedTargetMode(settings.wbTm as Parameters<typeof store.setWithBleedTargetMode>[0]);
    if (settings.wbTa !== undefined) store.setWithBleedTargetAmount(settings.wbTa);
    if (settings.nbTm) store.setNoBleedTargetMode(settings.nbTm as Parameters<typeof store.setNoBleedTargetMode>[0]);
    if (settings.nbTa !== undefined) store.setNoBleedTargetAmount(settings.nbTa);

    // Darken
    if (settings.dk) store.setDarkenMode(settings.dk as Parameters<typeof store.setDarkenMode>[0]);
    if (settings.dkC !== undefined) store.setDarkenContrast(settings.dkC);
    if (settings.dkE !== undefined) store.setDarkenEdgeWidth(settings.dkE);
    if (settings.dkA !== undefined) store.setDarkenAmount(settings.dkA);
    if (settings.dkB !== undefined) store.setDarkenBrightness(settings.dkB);
    if (settings.dkAd !== undefined) store.setDarkenAutoDetect(settings.dkAd);

    // Guide/Cut lines
    if (settings.gs) store.setPerCardGuideStyle(settings.gs as Parameters<typeof store.setPerCardGuideStyle>[0]);
    if (settings.gc) store.setGuideColor(settings.gc);
    if (settings.gw !== undefined) store.setGuideWidth(settings.gw);
    if (settings.gp) store.setGuidePlacement(settings.gp as Parameters<typeof store.setGuidePlacement>[0]);
    if (settings.cgL !== undefined) store.setCutGuideLengthMm(settings.cgL);
    if (settings.cls) store.setCutLineStyle(settings.cls as Parameters<typeof store.setCutLineStyle>[0]);

    // Spacing/Position
    if (settings.spc !== undefined) store.setCardSpacingMm(settings.spc);
    if (settings.pX !== undefined) store.setCardPositionX(settings.pX);
    if (settings.pY !== undefined) store.setCardPositionY(settings.pY);
    if (settings.ucbo !== undefined) store.setUseCustomBackOffset(settings.ucbo);
    if (settings.bpX !== undefined) store.setCardBackPositionX(settings.bpX);
    if (settings.bpY !== undefined) store.setCardBackPositionY(settings.bpY);

    // User Preferences
    if (settings.pas) store.setPreferredArtSource(settings.pas as Parameters<typeof store.setPreferredArtSource>[0]);
    if (settings.gl) store.setGlobalLanguage(settings.gl);
    if (settings.ait !== undefined) store.setAutoImportTokens(settings.ait);
    if (settings.mfs !== undefined) store.setMpcFuzzySearch(settings.mfs);
    if (settings.spt !== undefined) store.setShowProcessingToasts(settings.spt);

    // Sort & Filter
    if (settings.sb) store.setSortBy(settings.sb as Parameters<typeof store.setSortBy>[0]);
    if (settings.so) store.setSortOrder(settings.so as Parameters<typeof store.setSortOrder>[0]);
    if (settings.fmc) store.setFilterManaCost(settings.fmc);
    if (settings.fcol) store.setFilterColors(settings.fcol);
    if (settings.ftyp) store.setFilterTypes(settings.ftyp);
    if (settings.fcat) store.setFilterCategories(settings.fcat);
    if (settings.ffeat) store.setFilterFeatures(settings.ffeat);
    if (settings.fmt) store.setFilterMatchType(settings.fmt as Parameters<typeof store.setFilterMatchType>[0]);

    // Export
    if (settings.em) store.setExportMode(settings.em as Parameters<typeof store.setExportMode>[0]);
    if (settings.dsa !== undefined) store.setDecklistSortAlpha(settings.dsa);
}

/**
 * Convert deserialized share data to ImportIntents
 * Handles DFC links by filtering out back cards and attaching their IDs to front card intents.
 */
function convertToImportIntents(
    cards: ReturnType<typeof deserializeForImport>['cards'],
    dfcLinks: [number, number][]
): ImportIntent[] {
    // Build a set of back-card indices that should be excluded from direct import
    const backIndices = new Set(dfcLinks.map(([, backIndex]) => backIndex));

    // Build a map from front index to back card data
    const frontToBackData = new Map<number, typeof cards[number]>();
    for (const [frontIndex, backIndex] of dfcLinks) {
        frontToBackData.set(frontIndex, cards[backIndex]);
    }

    const intents: ImportIntent[] = [];

    for (let i = 0; i < cards.length; i++) {
        // Skip back cards - they'll be created as linked backs
        if (backIndices.has(i)) continue;

        const card = cards[i];
        const backData = frontToBackData.get(i);

        const intent: ImportIntent = {
            name: card.name || '',
            quantity: 1,
            isToken: false,
            set: card.set,
            number: card.number,
            mpcId: card.mpcIdentifier,
            category: card.category,
            cardOverrides: card.overrides,
            sourcePreference: card.mpcIdentifier ? 'mpc' as const : 'scryfall' as const,
            preferredImageId: card.imageId,
            order: card.order,
        };

        // Handle Back Face
        if (backData) {
            // Priority 1: Built-in Cardback
            if (backData.builtInCardbackId) {
                intent.linkedBackImageId = backData.builtInCardbackId;
                // Don't need name for cardbacks usually, but helpful for debugging
                intent.linkedBackName = backData.name || 'Cardback';
            }
            // Priority 2: MPC Card
            else if (backData.mpcIdentifier) {
                intent.linkedBackImageId = backData.mpcIdentifier;
                intent.linkedBackName = backData.name || 'Back';
            }
            // Priority 3: Scryfall Card (Explicit Set/Number)
            else if (backData.set && backData.number) {
                intent.linkedBackSet = backData.set;
                intent.linkedBackNumber = backData.number;
                intent.linkedBackName = backData.name || 'Back';
            }
        }

        intents.push(intent);
    }

    return intents;
}

/**
 * Hook to detect and load shared decks from URL.
 * Automatically imports cards using ImportOrchestrator.
 */
export function useShareUrl(): UseShareUrlResult {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [shareData, setShareData] = useState<ShareData | null>(null);
    const hasTriedLoading = useRef(false);

    useEffect(() => {
        // Prevent double-execution
        if (hasTriedLoading.current) return;

        const shareId = getShareIdFromUrl();
        if (!shareId) return;

        hasTriedLoading.current = true;

        const loadSharedDeck = async () => {
            setIsLoading(true);
            setError(null);

            try {
                // 1. Fetch Share Data FIRST (to have the truth)
                const data = await loadShare(shareId);
                setShareData(data);

                // 2. Check if we already have this project locally
                const existingProject = await db.projects.where('shareId').equals(shareId).first();

                if (existingProject) {
                    debugLog('[Share] Found existing project for share:', existingProject.id);

                    // 2a. Compare local state hashes
                    // Deserialize share data for import to getting hashable stat
                    const remoteStateObj = {
                        c: data.c,
                        dfc: data.dfc || [],
                        st: data.st || {}
                    };
                    const msgBuffer = new TextEncoder().encode(JSON.stringify(remoteStateObj));
                    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
                    const remoteHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

                    // Calculate Local Hash
                    const localCards = await db.cards.where('projectId').equals(existingProject.id).toArray();
                    const localSettings = existingProject.settings as SettingsInput;
                    const localHash = await calculateStateHash(localCards, localSettings);

                    // 2b. Check for Local Edits
                    // If lastSyncedHash is missing, we assume dirty UNLESS local==remote (which means we are luckily in sync)
                    const lastSyncedHash = existingProject.lastSyncedHash;
                    const isLocalClean = lastSyncedHash
                        ? lastSyncedHash === localHash
                        : localHash === remoteHash;

                    if (!isLocalClean) {
                        debugLog('[Share] Local project has user edits (Forking).');
                        // Branch: User Edited -> Fork
                        // 1. Unlink the old project so it doesn't verify against this shareId anymore
                        await db.projects.update(existingProject.id, { shareId: undefined });

                        // 2. Show toast
                        useToastStore.getState().showInfoToast(`Local changes detected. Created new copy of shared deck.`);

                        // 3. Fall through to Create New Project logic (below)
                    } else {
                        // Branch: Local is Clean (Unedited)
                        if (localHash === remoteHash) {
                            debugLog('[Share] Local project is up to date.');
                            // Ensure lastSyncedHash is set (migration for legacy clean projects)
                            if (!lastSyncedHash) {
                                await db.projects.update(existingProject.id, { lastSyncedHash: localHash });
                            }
                            await useProjectStore.getState().switchProject(existingProject.id);
                            useToastStore.getState().showSuccessToast(`Opened existing project "${existingProject.name}"`);
                            clearShareFromUrl();
                            setIsLoading(false);
                            return;
                        }

                        debugLog('[Share] Local project differs but is clean. Overwriting...');

                        // Update existing project
                        await db.cards.where('projectId').equals(existingProject.id).delete();
                        await useProjectStore.getState().switchProject(existingProject.id);

                        const { cards, dfcLinks, settings } = deserializeForImport(data);
                        if (settings) applyShareSettings(settings);

                        const intents = convertToImportIntents(cards, dfcLinks);
                        await ImportOrchestrator.process(intents, {
                            onComplete: async () => {
                                // Update hash after successful overwrite
                                await db.projects.update(existingProject.id, { lastSyncedHash: remoteHash });
                                useToastStore.getState().showSuccessToast(`Updated "${existingProject.name}" from share`);
                            }
                        });

                        clearShareFromUrl();
                        setIsLoading(false);
                        return;
                    }
                }

                // 3. Create New Project (Standard / Fork Flow)
                const { cards, dfcLinks, settings } = deserializeForImport(data);

                if (cards.length === 0) {
                    throw new Error('Shared deck contains no cards');
                }

                if (settings) {
                    applyShareSettings(settings);
                }

                // Create new project
                // Generate share name from first card?
                let firstCardName = 'Shared Deck';
                const firstCard = cards.find(c => c.name);
                if (firstCard && firstCard.name) firstCardName = firstCard.name;

                const newProjectId = await useProjectStore.getState().createProject(`${firstCardName} (Shared)`);
                await useProjectStore.getState().switchProject(newProjectId);

                // Calculate remote hash for initial sync state
                const remoteStateObj = {
                    c: data.c,
                    dfc: data.dfc || [],
                    st: data.st || {}
                };
                const msgBuffer = new TextEncoder().encode(JSON.stringify(remoteStateObj));
                const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
                const remoteHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

                await db.projects.update(newProjectId, {
                    shareId,
                    lastSyncedHash: remoteHash
                });

                if (settings) {
                    applyShareSettings(settings);
                }

                const intents = convertToImportIntents(cards, dfcLinks);

                await ImportOrchestrator.process(intents, {
                    onComplete: () => {
                        useToastStore.getState().showSuccessToast(`Imported ${intents.length} cards from shared deck`);
                    }
                });

                clearShareFromUrl();

            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to load shared deck';
                setError(message);
                useToastStore.getState().showErrorToast(message);
                console.error('[Share] Error loading share:', err);
            } finally {
                setIsLoading(false);
            }
        };

        loadSharedDeck();
    }, []); // Run on mount only (dependency array empty)

    return {
        isLoading,
        error,
        shareData,
    };
}

export default useShareUrl;
