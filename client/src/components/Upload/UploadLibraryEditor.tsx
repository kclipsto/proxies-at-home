import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TextInput } from 'flowbite-react';
import { X, Star, Trash2, Link2, Unlink, Plus } from 'lucide-react';
import { ResponsiveModal, FloatingZoomPanel } from '../common';
import { UploadLibraryContextMenu, type UploadContextMenuState } from './UploadLibraryContextMenu';
import {
    getUploadLibraryItems,
    deleteUploadLibraryItem,
    bulkUpdateFavorite,
    linkUploadFaces,
    unlinkUploadFaces,
    type UploadLibraryItem,
} from '@/helpers/uploadLibrary';
import { useZoomShortcuts } from '@/hooks/useZoomShortcuts';
import { useToastStore } from '@/store/toast';
import { useProjectStore } from '@/store';
import { useSelectionStore } from '@/store/selection';
import { undoableAddCards } from '@/helpers/undoableActions';
import { createLinkedBackCardsBulk } from '@/helpers/dbUtils';
import { UploadLibraryGrid } from './UploadLibraryGrid';
import { LinkFacesDialog } from './LinkFacesDialog';


interface UploadLibraryEditorProps {
    isOpen: boolean;
    onClose: () => void;
}

export function UploadLibraryEditor({ isOpen, onClose }: UploadLibraryEditorProps) {
    const [items, setItems] = useState<UploadLibraryItem[]>([]);
    const [selectedHashes, setSelectedHashes] = useState<Set<string>>(new Set());
    const [lastClickedHash, setLastClickedHash] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [zoomLevel, setZoomLevel] = useState(1.0);
    const [confirmDeleteHashes, setConfirmDeleteHashes] = useState<string[] | null>(null);
    const [linkDialogHashes, setLinkDialogHashes] = useState<[string, string] | null>(null);
    const [linkFrontHash, setLinkFrontHash] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState<'front' | 'back' | null>(null);
    const filteredItemsRef = useRef<UploadLibraryItem[]>([]);
    const [contextMenu, setContextMenu] = useState<UploadContextMenuState>({ visible: false, x: 0, y: 0, hash: null });
    const [pendingIdentifyHash, setPendingIdentifyHash] = useState<string | null>(null);
    const [pendingRenameHash, setPendingRenameHash] = useState<string | null>(null);

    useZoomShortcuts({ setZoom: setZoomLevel, isOpen, minZoom: 0.5, maxZoom: 5 });

    useEffect(() => {
        if (isOpen) {
            getUploadLibraryItems().then(setItems);
        } else {
            setSelectedHashes(new Set());
            setQuery('');
            setConfirmDeleteHashes(null);
            setLinkDialogHashes(null);
        }
    }, [isOpen]);

    const refreshItems = useCallback(async () => {
        const fresh = await getUploadLibraryItems();
        setItems(fresh);
    }, []);

    const handleToggleSelect = useCallback((hash: string, shiftKey: boolean) => {
        setSelectedHashes(prev => {
            const next = new Set(prev);
            if (shiftKey && lastClickedHash) {
                const currentItems = filteredItemsRef.current;
                const startIdx = currentItems.findIndex(i => i.hash === lastClickedHash);
                const endIdx = currentItems.findIndex(i => i.hash === hash);
                if (startIdx !== -1 && endIdx !== -1) {
                    const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
                    for (let i = from; i <= to; i++) {
                        next.add(currentItems[i].hash);
                    }
                }
            } else if (next.has(hash)) {
                next.delete(hash);
            } else {
                next.add(hash);
            }
            return next;
        });
        setLastClickedHash(hash);
    }, [lastClickedHash]);

    const handleSelectAll = useCallback(() => {
        setSelectedHashes(new Set(filteredItemsRef.current.map(i => i.hash)));
    }, []);

    const handleDeselectAll = useCallback(() => {
        setSelectedHashes(new Set());
    }, []);

    const handleDelete = useCallback(async (hashes: string[]) => {
        for (const hash of hashes) {
            await deleteUploadLibraryItem(hash);
        }
        setSelectedHashes(prev => {
            const next = new Set(prev);
            hashes.forEach(h => next.delete(h));
            return next;
        });
        setConfirmDeleteHashes(null);
        await refreshItems();
        const count = hashes.length;
        useToastStore.getState().showSuccessToast(count === 1 ? 'upload deleted' : `${count} uploads deleted`);
    }, [refreshItems]);

    const handleBulkFavorite = useCallback(async (isFavorite: boolean) => {
        await bulkUpdateFavorite(Array.from(selectedHashes), isFavorite);
        await refreshItems();
    }, [selectedHashes, refreshItems]);

    const handleLinkFaces = useCallback(async () => {
        if (!linkDialogHashes || !linkFrontHash) return;
        const backHash = linkDialogHashes.find(h => h !== linkFrontHash);
        if (!backHash) return;
        await linkUploadFaces(linkFrontHash, backHash);
        setLinkDialogHashes(null);
        setLinkFrontHash(null);
        setSelectedHashes(new Set());
        await refreshItems();
        useToastStore.getState().showSuccessToast('Faces linked');
    }, [linkDialogHashes, linkFrontHash, refreshItems]);

    const handleUnlink = useCallback(async (hashes: string[]) => {
        for (const hash of hashes) {
            await unlinkUploadFaces(hash);
        }
        await refreshItems();
    }, [refreshItems]);

    const openLinkDialog = useCallback(() => {
        const selected = Array.from(selectedHashes);
        if (selected.length !== 2) return;
        setLinkDialogHashes([selected[0], selected[1]]);
        setLinkFrontHash(selected[0]);
    }, [selectedHashes]);

    const hasLinkedSelected = Array.from(selectedHashes).some(h => {
        const item = items.find(i => i.hash === h);
        return item?.linkedFrontHash || item?.linkedBackHash;
    });

    const handleAddToProject = useCallback(async (hashes: string[]) => {
        const hashSet = new Set(hashes);
        const frontItems: Array<UploadLibraryItem & { flipped?: boolean }> = [];
        const backTasks: Array<{ frontIndex: number; backItem: UploadLibraryItem }> = [];
        for (const hash of hashes) {
            const item = items.find(i => i.hash === hash);
            if (!item) continue;
            if (item.linkedFrontHash && hashSet.has(item.linkedFrontHash)) continue;
            if (item.linkedFrontHash && !hashSet.has(item.linkedFrontHash)) {
                const frontItem = items.find(i => i.hash === item.linkedFrontHash);
                if (frontItem) {
                    const idx = frontItems.length;
                    frontItems.push({ ...frontItem, flipped: true });
                    backTasks.push({ frontIndex: idx, backItem: item });
                    continue;
                }
            }
            const idx = frontItems.length;
            frontItems.push(item);
            if (item.linkedBackHash) {
                const backItem = items.find(i => i.hash === item.linkedBackHash);
                if (backItem) backTasks.push({ frontIndex: idx, backItem });
            }
        }
        if (frontItems.length === 0) return;
        const addedCards = await undoableAddCards(
            frontItems.map(item => ({
                name: item.displayName,
                imageId: item.hash,
                isUserUpload: true,
                hasBuiltInBleed: item.hasBuiltInBleed,
                isFlipped: item.flipped || undefined,
                projectId: useProjectStore.getState().currentProjectId ?? undefined,
                overrides: { darkenMode: 'none' as const, darkenUseGlobalSettings: false },
            }))
        );
        if (backTasks.length > 0 && addedCards.length > 0) {
            await createLinkedBackCardsBulk(
                backTasks.map(t => ({
                    frontUuid: addedCards[t.frontIndex].uuid,
                    backImageId: t.backItem.hash,
                    backName: t.backItem.displayName,
                    options: {
                        hasBuiltInBleed: t.backItem.hasBuiltInBleed,
                        usesDefaultCardback: false,
                        overrides: { darkenMode: 'none' as const, darkenUseGlobalSettings: false },
                    },
                }))
            );
        }
        const flippedUuids = addedCards.filter(c => c.isFlipped).map(c => c.uuid);
        if (flippedUuids.length > 0) {
            useSelectionStore.getState().setFlipped(flippedUuids, true);
        }
        useToastStore.getState().showSuccessToast(
            frontItems.length === 1 ? 'Added to project' : `${frontItems.length} cards added to project`
        );
    }, [items]);

    const clearPendingAction = useCallback(() => {
        setPendingIdentifyHash(null);
        setPendingRenameHash(null);
    }, []);

    const handleContextMenu = useCallback((e: React.MouseEvent, hash: string) => {
        setContextMenu({ visible: true, x: e.clientX, y: e.clientY, hash });
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && selectedHashes.size > 0) {
                e.preventDefault();
                e.stopImmediatePropagation();
                setSelectedHashes(new Set());
            }
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true });
    }, [isOpen, selectedHashes]);

    if (!isOpen) return null;

    return (
        <>
            <ResponsiveModal isOpen={isOpen} onClose={onClose} title="Manage Uploads">
                <div className="flex-1 flex flex-col overflow-hidden min-h-0 relative bg-gray-50 dark:bg-gray-700">
                    <div
                        className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide p-4"
                        onClick={(e) => { if (e.target === e.currentTarget) setSelectedHashes(new Set()); }}
                    >
                        <UploadLibraryGrid
                            mode="editor"
                            items={items}
                            onRefresh={refreshItems}
                            cardSize={zoomLevel}
                            query={query}
                            selectedHashes={selectedHashes}
                            onToggleSelect={handleToggleSelect}
                            onDisplayItemsChange={(displayItems) => { filteredItemsRef.current = displayItems; }}
                            onContextMenu={handleContextMenu}
                            pendingIdentifyHash={pendingIdentifyHash}
                            pendingRenameHash={pendingRenameHash}
                            onPendingActionHandled={clearPendingAction}
                        />
                    </div>
                    <FloatingZoomPanel
                        zoom={zoomLevel}
                        onZoomChange={setZoomLevel}
                        minZoom={0.5}
                        maxZoom={5}
                        className="hidden lg:block"
                    />
                </div>
                <div className="p-3 border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 shrink-0 z-20">
                    <div className="flex gap-2 items-center flex-wrap">
                        {selectedHashes.size > 0 ? (
                            <>
                                <span className="text-sm text-gray-600 dark:text-gray-300 font-medium">
                                    {selectedHashes.size} selected
                                </span>
                                <button
                                    onClick={() => setConfirmDeleteHashes(Array.from(selectedHashes))}
                                    className="px-3 py-1.5 text-xs rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
                                >
                                    <Trash2 className="w-3.5 h-3.5 inline mr-1" />Delete
                                </button>
                                <button
                                    onClick={() => handleAddToProject(Array.from(selectedHashes))}
                                    className="px-3 py-1.5 text-xs rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors"
                                >
                                    <Plus className="w-3.5 h-3.5 inline mr-1" />Add to Project
                                </button>
                                <button
                                    onClick={() => handleBulkFavorite(true)}
                                    className="px-3 py-1.5 text-xs rounded-lg bg-yellow-500 hover:bg-yellow-600 text-white transition-colors"
                                >
                                    <Star className="w-3.5 h-3.5 inline mr-1" />Favorite
                                </button>
                                {selectedHashes.size === 2 && (
                                    <button
                                        onClick={openLinkDialog}
                                        className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
                                    >
                                        <Link2 className="w-3.5 h-3.5 inline mr-1" />Link Faces
                                    </button>
                                )}
                                {hasLinkedSelected && (
                                    <button
                                        onClick={() => handleUnlink(Array.from(selectedHashes))}
                                        className="px-3 py-1.5 text-xs rounded-lg bg-orange-600 hover:bg-orange-700 text-white transition-colors"
                                    >
                                        <Unlink className="w-3.5 h-3.5 inline mr-1" />Unlink
                                    </button>
                                )}
                                <button
                                    onClick={handleDeselectAll}
                                    className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                                >
                                    <X className="w-3.5 h-3.5 inline mr-1" />Deselect
                                </button>
                                <button
                                    onClick={handleSelectAll}
                                    className="ml-auto px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                                >
                                    Select All
                                </button>
                            </>
                        ) : (
                            <div className="relative flex-1 h-10">
                                <TextInput
                                    sizing="lg"
                                    type="text"
                                    placeholder="Search uploads..."
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    className="w-full h-full"
                                    theme={{
                                        field: {
                                            input: {
                                                base: "block w-full border disabled:cursor-not-allowed disabled:opacity-50 h-full",
                                                sizes: { lg: "p-2.5 sm:text-base" },
                                                colors: {
                                                    gray: "bg-gray-100 border-gray-300 text-gray-900 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400 dark:focus:border-primary-500 dark:focus:ring-primary-500"
                                                }
                                            }
                                        }
                                    }}
                                />
                                {query && (
                                    <button
                                        onClick={() => setQuery('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                    >
                                        <X className="w-5 h-5" strokeWidth={2.5} />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </ResponsiveModal>

            {confirmDeleteHashes && createPortal(
                <div className="fixed inset-0 z-200000 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setConfirmDeleteHashes(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-sm mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Delete uploads?</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            {confirmDeleteHashes.length === 1
                                ? 'This upload will be permanently deleted.'
                                : `${confirmDeleteHashes.length} uploads will be permanently deleted.`}
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setConfirmDeleteHashes(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                Cancel
                            </button>
                            <button onClick={() => handleDelete(confirmDeleteHashes)} className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors">
                                Delete
                            </button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {linkDialogHashes && createPortal(
                <LinkFacesDialog
                    hashes={linkDialogHashes}
                    items={items}
                    frontHash={linkFrontHash}
                    onFrontHashChange={setLinkFrontHash}
                    dragOver={dragOver}
                    onDragOverChange={setDragOver}
                    onConfirm={handleLinkFaces}
                    onCancel={() => { setLinkDialogHashes(null); setLinkFrontHash(null); }}
                />, document.body
            )}

            {createPortal(
                <UploadLibraryContextMenu
                    contextMenu={contextMenu}
                    setContextMenu={setContextMenu}
                    items={items}
                    selectedHashes={selectedHashes}
                    onAddToProject={handleAddToProject}
                    onToggleFavorite={async (hash) => {
                        const item = items.find(i => i.hash === hash);
                        if (item) {
                            await bulkUpdateFavorite([hash], !item.isFavorite);
                            await refreshItems();
                        }
                    }}
                    onIdentify={(hash) => setPendingIdentifyHash(hash)}
                    onRename={(hash) => setPendingRenameHash(hash)}
                    onDelete={(hashes) => setConfirmDeleteHashes(hashes)}
                    onUnlink={async (hash) => {
                        await unlinkUploadFaces(hash);
                        await refreshItems();
                    }}
                />, document.body
            )}
        </>
    );
}
