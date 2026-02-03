import { useState, useMemo, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { Plus, Check, Trash2, Edit2, Share2, RefreshCw, AlertCircle } from "lucide-react";
import { useProjectStore, useSettingsStore } from "@/store";
import { SelectDropdown } from "@/components/common";
import { Button, TextInput, Label, Modal, ModalHeader, ModalBody, ModalFooter } from "flowbite-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db";
import { createShare, getShareWarnings } from "@/helpers/shareHelper";
import { useToastStore } from "@/store/toast";
import { useShallow } from "zustand/react/shallow";
import { useShareSync } from "@/hooks/useShareSync";
import { debugLog } from "@/helpers/debug";

export function ProjectSelector() {
    const projects = useProjectStore((state) => state.projects);
    const currentProjectId = useProjectStore((state) => state.currentProjectId);
    const switchProject = useProjectStore((state) => state.switchProject);
    const createProject = useProjectStore((state) => state.createProject);
    const deleteProject = useProjectStore((state) => state.deleteProject);
    const renameProject = useProjectStore((state) => state.renameProject);

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    // Modal states
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [createName, setCreateName] = useState("");

    const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
    const [renameName, setRenameName] = useState("");
    const [projectToRename, setProjectToRename] = useState<{ id: string; name: string } | null>(null);

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [projectToDelete, setProjectToDelete] = useState<{ id: string; name: string } | null>(null);

    const currentProject = projects.find((p) => p.id === currentProjectId);

    const handleSwitch = (id: string) => {
        if (id === currentProjectId) return;
        switchProject(id);
        setIsDropdownOpen(false);
    };

    // --- Create ---
    const handleCreateProject = async () => {
        if (!createName.trim()) return;
        const newId = await createProject(createName);
        await switchProject(newId);
        setCreateName("");
        setIsCreateModalOpen(false);
        setIsDropdownOpen(false);
    };

    // --- Rename ---
    const handleRenameClick = (e: React.MouseEvent, project: { id: string; name: string }) => {
        e.stopPropagation();
        setProjectToRename(project);
        setRenameName(project.name);
        setIsRenameModalOpen(true);
        // Do not close dropdown to allow quick edits? Or close it? 
        // Better to close it to avoid z-index issues / clutter
        setIsDropdownOpen(false);
    };

    const confirmRename = async () => {
        if (projectToRename && renameName.trim()) {
            await renameProject(projectToRename.id, renameName);
            setIsRenameModalOpen(false);
            setProjectToRename(null);
            setRenameName("");
        }
    };

    // --- Delete ---
    const handleDeleteClick = (e: React.MouseEvent, project: { id: string; name: string }) => {
        e.stopPropagation();
        setProjectToDelete(project);
        setIsDeleteModalOpen(true);
        setIsDropdownOpen(false);
    };

    const confirmDelete = async () => {
        if (projectToDelete) {
            await deleteProject(projectToDelete.id);
            setProjectToDelete(null);
            setIsDeleteModalOpen(false);
        }
    };

    // --- Share Project ---
    const cardsQuery = useLiveQuery(async () => {
        if (!currentProjectId) return [];
        const items = await db.cards.where('projectId').equals(currentProjectId).sortBy('order');
        // Use central sorting logic (handles Shared Slot Key order + Front/Back tie-break)
        const { sortCards } = await import('../../helpers/dbUtils');
        return sortCards(items);
    }, [currentProjectId]);
    const cards = useMemo(() => cardsQuery ?? [], [cardsQuery]);

    // Migration / cleanup: Enforce shared slot topology on load
    useEffect(() => {
        if (currentProjectId) {
            import("../../helpers/dbUtils").then(({ rebalanceCardOrders }) => {
                rebalanceCardOrders(currentProjectId).catch(console.error);
            });
        }
    }, [currentProjectId]);

    // All share-relevant settings from store
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
    })));

    const shareWarnings = useMemo(() => getShareWarnings(cards), [cards]);
    const hasWarnings = shareWarnings.length > 0;
    const shareableCount = useMemo(() => cards.filter(c => !c.linkedFrontId && !c.isUserUpload).length, [cards]);

    const handleShare = useCallback(async () => {
        // Wait briefly for any pending DB writes to flush (race condition protection)
        await new Promise(resolve => setTimeout(resolve, 50));

        // Fetch latest cards directly from DB, sorted by order + Atomic Slot logic
        const latestCards = currentProjectId
            ? await db.cards.where('projectId').equals(currentProjectId).sortBy('order')
            : [];

        // Apply Composite Sort (Order ASC, Front First)
        latestCards.sort((a, b) => {
            if (Math.abs(a.order - b.order) > 0.0001) return a.order - b.order;
            const aIsBack = !!a.linkedFrontId;
            const bIsBack = !!b.linkedFrontId;
            return Number(aIsBack) - Number(bIsBack);
        });


        if (latestCards.length === 0) {
            useToastStore.getState().showErrorToast('No cards to share');
            return;
        }

        debugLog(`[ProjectSelector] handleShare - Fetched ${latestCards.length} cards for Project ${currentProjectId}:`);
        debugLog(latestCards.map(c => `${c.name} (${c.order})`));
        try {
            const result = await createShare(latestCards, settings, currentProjectId ?? undefined);

            // Save shareId and lastSharedAt for auto-sync
            if (currentProjectId) {
                await db.projects.update(currentProjectId, {
                    shareId: result.id,
                    lastSharedAt: Date.now(),
                });
            }

            await navigator.clipboard.writeText(result.url);
            let message = 'Share link copied to clipboard!';
            if (result.skipped > 0) {
                message += ` (${result.skipped} custom upload${result.skipped > 1 ? 's' : ''} excluded)`;
            }
            useToastStore.getState().showCopyToast(message);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to create share';
            useToastStore.getState().showErrorToast(message);
        }
    }, [settings, currentProjectId]);

    // Auto-sync shared projects
    const { syncStatus } = useShareSync();

    return (
        <>
            <div className="flex flex-col gap-2">
                <SelectDropdown
                    isOpen={isDropdownOpen}
                    onToggle={() => setIsDropdownOpen(!isDropdownOpen)}
                    onClose={() => setIsDropdownOpen(false)}
                    buttonText={currentProject?.name || "Select Project"}
                    selectedLabel={currentProject?.name}
                    singleSelectMode={true}
                    className="w-full"
                >
                    <div className="flex flex-col p-1 gap-1 min-w-[220px]">
                        <div className="text-xs font-semibold text-gray-500 px-2 py-1 uppercase">
                            Your Projects
                        </div>

                        <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
                            {projects.map((project) => (
                                <div
                                    key={project.id}
                                    onClick={() => handleSwitch(project.id)}
                                    className={`
                                        group flex items-center justify-between px-2 py-2 rounded-md cursor-pointer text-sm
                                        ${project.id === currentProjectId
                                            ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                                            : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                                        }
                                    `}
                                >
                                    <div className="flex items-center gap-2 truncate flex-1">
                                        {project.id === currentProjectId && <Check className="w-4 h-4 shrink-0" />}
                                        <span className={`truncate ${project.id !== currentProjectId ? 'pl-6' : ''}`}>
                                            {project.name}
                                        </span>
                                    </div>

                                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => handleRenameClick(e, project)}
                                            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 hover:text-blue-600 transition-colors"
                                            title="Rename Project"
                                        >
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>

                                        {/* Delete action (only if strictly more than 1 project) */}
                                        {projects.length > 1 && (
                                            <button
                                                onClick={(e) => handleDeleteClick(e, project)}
                                                className="p-1.5 rounded hover:bg-red-100 text-gray-500 hover:text-red-500 transition-colors ml-1"
                                                title="Delete Project"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="h-px bg-gray-200 dark:bg-gray-600 my-1" />

                        <button
                            onClick={() => {
                                setIsCreateModalOpen(true);
                                setIsDropdownOpen(false);
                            }}
                            className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-blue-50 text-blue-600 dark:text-blue-400 dark:hover:bg-blue-900/20 text-sm font-medium transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Create New Project...
                        </button>
                    </div>
                </SelectDropdown>

                {/* Share Project Button */}
                <button
                    type="button"
                    onClick={handleShare}
                    disabled={shareableCount === 0}
                    title={
                        hasWarnings
                            ? shareWarnings.join(', ')
                            : shareableCount === 0
                                ? 'No shareable cards'
                                : 'Create a shareable link to this project'
                    }
                    className={`
                        w-full flex items-center justify-center gap-2 cursor-pointer rounded-md
                        bg-purple-600 hover:bg-purple-700
                        disabled:bg-purple-600/50 disabled:cursor-not-allowed
                        px-4 py-2 text-white transition-colors
                        ${shareableCount === 0 ? '' : 'active:translate-y-[2px]'}
                    `.trim().replace(/\s+/g, ' ')}
                >
                    <Share2 className="w-5 h-5" />
                    <span className="text-sm font-medium">Share Project</span>
                    {/* Sync status indicator */}
                    {syncStatus === 'pending' && (
                        <span title="Changes pending sync">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-200" />
                        </span>
                    )}
                    {syncStatus === 'syncing' && (
                        <span title="Syncing...">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        </span>
                    )}

                    {syncStatus === 'error' && (
                        <span title="Sync failed">
                            <AlertCircle className="w-3.5 h-3.5 text-red-300" />
                        </span>
                    )}
                    {hasWarnings && (
                        <span className="bg-yellow-400 text-black text-xs px-1.5 py-0.5 rounded-full font-medium">
                            !
                        </span>
                    )}
                </button>
            </div>

            {/* Create Project Modal */}
            <Modal
                show={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                size="md"
            >
                <ModalHeader>Create New Project</ModalHeader>
                <ModalBody>
                    <div className="space-y-4">
                        <div>
                            <div className="mb-2 block">
                                <Label htmlFor="createProjectName">Project Name</Label>
                            </div>
                            <TextInput
                                id="createProjectName"
                                placeholder="My Awesome Deck"
                                value={createName}
                                onChange={(e) => setCreateName(e.target.value)}
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleCreateProject();
                                }}
                            />
                        </div>
                    </div>
                </ModalBody>
                <ModalFooter>
                    <div className="flex justify-end gap-2 w-full">
                        <Button color="gray" onClick={() => setIsCreateModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreateProject} disabled={!createName.trim()}>
                            Create
                        </Button>
                    </div>
                </ModalFooter>
            </Modal>

            {/* Rename Project Modal */}
            <Modal
                show={isRenameModalOpen}
                onClose={() => setIsRenameModalOpen(false)}
                size="md"
            >
                <ModalHeader>Rename Project</ModalHeader>
                <ModalBody>
                    <div className="space-y-4">
                        <div>
                            <div className="mb-2 block">
                                <Label htmlFor="renameProjectName">New Name</Label>
                            </div>
                            <TextInput
                                id="renameProjectName"
                                value={renameName}
                                onChange={(e) => setRenameName(e.target.value)}
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') confirmRename();
                                }}
                            />
                        </div>
                    </div>
                </ModalBody>
                <ModalFooter>
                    <div className="flex justify-end gap-2 w-full">
                        <Button color="gray" onClick={() => setIsRenameModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={confirmRename} disabled={!renameName.trim()}>
                            Save
                        </Button>
                    </div>
                </ModalFooter>
            </Modal>

            {/* Delete Confirmation Modal - Matched to Clear Cards style */}
            {isDeleteModalOpen && createPortal(
                <div className="fixed inset-0 z-50 bg-gray-900/50 flex items-center justify-center">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded shadow-md w-96 text-center">
                        <div className="mb-4 text-lg font-semibold text-gray-800 dark:text-white">
                            Confirm Delete Project
                        </div>
                        <div className="mb-5 text-lg font-normal text-gray-500 dark:text-gray-400">
                            Delete project "{projectToDelete?.name}"? <br />
                            This action cannot be undone. All cards in this project will be permanently deleted.
                        </div>
                        <div className="flex justify-center gap-4">
                            <Button
                                color="failure"
                                className="bg-red-600 hover:bg-red-700 text-white"
                                onClick={confirmDelete}
                            >
                                Yes, I'm sure
                            </Button>
                            <Button
                                color="gray"
                                onClick={() => setIsDeleteModalOpen(false)}
                            >
                                No, cancel
                            </Button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
