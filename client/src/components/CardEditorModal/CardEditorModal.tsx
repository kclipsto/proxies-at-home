/**
 * CardEditorModal v6
 * 
 * Modal for editing card visual parameters.
 * - Larger modal taking up more screen space
 * - DPI toggle that loads higher/lower res image
 * - Front/Back split button
 * - Settings initialize from global defaults
 */

import { memo, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { paramsToOverrides } from './paramsToOverrides';
import { Modal, ModalHeader, ModalBody, ModalFooter, Button } from 'flowbite-react';
import { Sun, Palette, RotateCcw, Moon, Sparkles, RefreshCw, ZoomIn, ZoomOut, Eye, EyeOff, ChevronsDown, ChevronsUp, WandSparkles, Replace, SquareDashedTopSolid } from 'lucide-react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ZoomControls } from '../PageView/ZoomControls';
import { PixiCardPreview } from '../PixiPage/PixiCardPreview';
import { useSettingsStore } from '@/store/settings';
import { useUserPreferencesStore } from '@/store/userPreferences';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { DEFAULT_RENDER_PARAMS, type RenderParams } from '../CardCanvas';
import type { CardOption, CardOverrides } from '../../../../shared/types';
import type { Image } from '../../db';
import { calculateDarknessFactorFromBlob } from '@/helpers/imageHistogram';
import './CardEditorModal.css';

import {
    BasicAdjustmentsSection,
    DarkPixelsSection,
    EnhanceSection,
    HolographicSection,
    ColorReplaceSection,
    GammaSection,
    ColorEffectsSection,
    BorderEffectsSection,
    type SectionProps,
} from './sections';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    card: CardOption;
    image: Image | null;
    backCard?: CardOption;
    backImage?: Image | null;
    /** Which face to show initially */
    initialFace?: 'front' | 'back';
    onApply: (cardUuid: string, overrides: CardOption['overrides'], customBlob?: Blob) => void;
    onApplyToAll: (overrides: CardOption['overrides']) => void;
    /** Apply overrides to all selected cards (for multi-select edit mode) */
    onApplyToSelected?: (selectedUuids: string[], overrides: CardOption['overrides']) => void;
    /** List of selected card UUIDs (for multi-select edit mode) */
    selectedCardUuids?: string[];
    /** Number of selected cards (for multi-select edit mode) */
    selectedCount?: number;
}

// Card dimensions for preview
const PREVIEW_WIDTH = 400;
const PREVIEW_HEIGHT = 560;

// Sortable collapsible section with drag/drop
const SortableSection = memo(function SortableSection({
    id,
    title,
    icon: Icon,
    isOpen,
    onToggle,
    children,
}: {
    id: string;
    title: string;
    icon: React.ElementType;
    isOpen: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="bg-gray-100 dark:bg-gray-700 border-b border-gray-400 dark:border-gray-500 last:border-b-0"
        >
            <div
                {...attributes}
                {...listeners}
                onClick={onToggle}
                style={{ touchAction: 'none' }}
                className="w-full flex items-center px-3 py-3 bg-gray-200 dark:bg-gray-800 select-none cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-900 transition-colors gap-2 text-base font-medium text-gray-700 dark:text-gray-200"
            >
                <Icon className="size-5" />
                <span className="flex-1 text-left">{title}</span>
            </div>
            {isOpen && !isDragging && (
                <div className="p-3 space-y-3 bg-gray-100 dark:bg-gray-700">
                    {children}
                </div>
            )}
        </div>
    );
});

// Section configuration for dynamic rendering
const SECTION_CONFIG: Record<string, { title: string; icon: React.ElementType; Content: React.ComponentType<SectionProps> }> = {
    basic: { title: 'Image Adjustments', icon: Sun, Content: BasicAdjustmentsSection },
    enhance: { title: 'Enhancements', icon: WandSparkles, Content: EnhanceSection },
    darkPixels: { title: 'Dark Pixels', icon: Moon, Content: DarkPixelsSection },
    holographic: { title: 'Holographic', icon: Sparkles, Content: HolographicSection },
    colorReplace: { title: 'Color Replace', icon: Replace, Content: ColorReplaceSection },
    gamma: { title: 'Gamma', icon: Sun, Content: GammaSection },
    colorEffects: { title: 'Color Effects', icon: Palette, Content: ColorEffectsSection },
    borderEffects: { title: 'Border Effects', icon: SquareDashedTopSolid, Content: BorderEffectsSection },
};

export function CardEditorModal({
    isOpen,
    onClose,
    card,
    image,
    backCard,
    backImage,
    initialFace = 'front',
    onApply,
    onApplyToAll,
    onApplyToSelected,
    selectedCardUuids,
    selectedCount,
}: Props) {
    // Get global settings reactively (subscribes to store changes)
    const globalDarkenMode = useSettingsStore((state) => state.darkenMode);

    // Global defaults derived from store subscription
    const globalDefaults = useMemo(() => ({ darkenMode: globalDarkenMode }), [globalDarkenMode]);

    const defaultParams = useMemo(() => ({
        ...DEFAULT_RENDER_PARAMS,
        ...globalDefaults,
    }), [globalDefaults]);

    // Helper to get initial params from card overrides
    const getInitialParams = useCallback((cardOverrides?: CardOverrides) => {
        const base = {
            ...DEFAULT_RENDER_PARAMS,
            ...globalDefaults,
        };
        if (cardOverrides && Object.keys(cardOverrides).length > 0) {
            return { ...base, ...cardOverrides };
        }
        return base;
    }, [globalDefaults]);

    // Separate params for front and back - each card has independent settings
    const [frontParams, setFrontParams] = useState<RenderParams>(() => getInitialParams(card.overrides));
    const [backParams, setBackParams] = useState<RenderParams>(() => getInitialParams(backCard?.overrides));

    // showBack state - initialize from initialFace prop
    // The useState initializer evaluates only once when component mounts
    const [showBack, setShowBack] = useState(() => {
        return initialFace === 'back';
    });

    // Separate effect to reinitialize params when modal opens or card changes
    useEffect(() => {
        if (isOpen) {
            setFrontParams(getInitialParams(card.overrides));
            setBackParams(getInitialParams(backCard?.overrides));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, card.uuid, backCard?.uuid]);

    const [isApplying, setIsApplying] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
    const [useExportRes, setUseExportRes] = useState(false);
    const [showOriginal, setShowOriginal] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Mobile detection
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Mobile zoom controls (click-to-toggle)
    const [showMobileZoomControls, setShowMobileZoomControls] = useState(false);
    const mobileZoomControlsRef = useRef<HTMLDivElement>(null);
    useOnClickOutside(mobileZoomControlsRef, () => setShowMobileZoomControls(false));

    // Computed params/setParams that switch based on showBack
    // This allows existing code to use `params` and it will automatically
    // read/write to the correct front or back params
    const params = showBack ? backParams : frontParams;
    const setParams = useCallback((updater: React.SetStateAction<RenderParams>) => {
        if (showBack) {
            setBackParams(updater);
        } else {
            setFrontParams(updater);
        }
    }, [showBack]);

    // Track blob URLs
    const [frontUrl, setFrontUrl] = useState<string | null>(null);
    const [backUrl, setBackUrl] = useState<string | null>(null);
    const prevFrontBlobRef = useRef<Blob | null>(null);
    const prevBackBlobRef = useRef<Blob | null>(null);

    // Section open state (persisted in user preferences, default to all expanded)
    const cardEditorSectionCollapsed = useUserPreferencesStore((state) => state.preferences?.cardEditorSectionCollapsed ?? {});
    const setCardEditorSectionCollapsed = useUserPreferencesStore((state) => state.setCardEditorSectionCollapsed);

    // Section order (persisted in user preferences)
    const cardEditorSectionOrder = useUserPreferencesStore((state) =>
        (state.preferences?.cardEditorSectionOrder && state.preferences.cardEditorSectionOrder.length > 0)
            ? state.preferences.cardEditorSectionOrder
            : ['basic', 'enhance', 'darkPixels', 'holographic', 'colorReplace', 'gamma', 'colorEffects', 'borderEffects']
    );
    const setCardEditorSectionOrder = useUserPreferencesStore((state) => state.setCardEditorSectionOrder);

    // Helper to check if a section is open (not collapsed = open)
    const isSectionOpen = useCallback((id: string) => !cardEditorSectionCollapsed[id], [cardEditorSectionCollapsed]);

    // Drag/drop sensors
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                delay: 200,
                tolerance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = cardEditorSectionOrder.indexOf(active.id as string);
            const newIndex = cardEditorSectionOrder.indexOf(over.id as string);
            setCardEditorSectionOrder(arrayMove(cardEditorSectionOrder, oldIndex, newIndex));
        }
    }, [cardEditorSectionOrder, setCardEditorSectionOrder]);

    // Check if params differ from defaults (including global settings)
    const isDirty = JSON.stringify(params) !== JSON.stringify(defaultParams);

    // Get the appropriate blob based on resolution setting
    const getFrontBlob = useCallback(() => {
        if (!image) return null;
        return useExportRes ? (image.exportBlob ?? image.displayBlob) : image.displayBlob;
    }, [image, useExportRes]);

    const getBackBlob = useCallback(() => {
        if (!backImage) return null;
        return useExportRes ? (backImage.exportBlob ?? backImage.displayBlob) : backImage.displayBlob;
    }, [backImage, useExportRes]);

    // Create/update blob URLs when blobs or resolution changes
    useEffect(() => {
        const frontBlob = getFrontBlob() ?? null;
        const backBlob = getBackBlob() ?? null;

        if (frontBlob !== prevFrontBlobRef.current) {
            if (frontUrl) URL.revokeObjectURL(frontUrl);
            setFrontUrl(frontBlob ? URL.createObjectURL(frontBlob) : null);
            prevFrontBlobRef.current = frontBlob;
        }

        if (backBlob !== prevBackBlobRef.current) {
            if (backUrl) URL.revokeObjectURL(backUrl);
            setBackUrl(backBlob ? URL.createObjectURL(backBlob) : null);
            prevBackBlobRef.current = backBlob;
        }
    }, [getFrontBlob, getBackBlob]); // eslint-disable-line react-hooks/exhaustive-deps

    // Cleanup on unmount only
    useEffect(() => {
        return () => {
            if (frontUrl) URL.revokeObjectURL(frontUrl);
            if (backUrl) URL.revokeObjectURL(backUrl);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Reset zoom/pan state when modal opens with new card
    // NOTE: showBack is now correctly initialized via useState from initialFace prop
    // NOTE: params initialization is handled by the earlier useEffect that uses reactive globalDefaults
    useEffect(() => {
        if (isOpen) {
            setZoom(1);
            setPan({ x: 0, y: 0 });
            // DO NOT reset showBack here - it's initialized correctly via useState(initialFace === 'back')
            setUseExportRes(false);
        }
    }, [isOpen, card.uuid]);

    // Pan handlers - allow panning at all zoom levels
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        setIsPanning(true);
        panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }, [pan]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (isPanning) {
            const dx = e.clientX - panStart.current.x;
            const dy = e.clientY - panStart.current.y;
            let newX = panStart.current.panX + dx;
            let newY = panStart.current.panY + dy;

            // Center snapping - snap to 0 when within threshold
            const SNAP_THRESHOLD = 35;
            if (Math.abs(newX) < SNAP_THRESHOLD) newX = 0;
            if (Math.abs(newY) < SNAP_THRESHOLD) newY = 0;

            setPan({ x: newX, y: newY });
        }
    }, [isPanning]);

    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
    }, []);

    // Wheel zoom
    const handleWheel = useCallback((e: React.WheelEvent) => {
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom(z => Math.min(Math.max(z * delta, 0.5), 3));
    }, []);

    const handleApply = useCallback(async (shouldClose = false) => {
        setIsApplying(true);
        try {
            const frontOverrides = paramsToOverrides(frontParams);

            // In multi-select mode, apply to all selected cards
            if (selectedCardUuids && selectedCardUuids.length > 1 && onApplyToSelected) {
                onApplyToSelected(selectedCardUuids, frontOverrides);
            } else {
                // Apply front overrides to front card
                onApply(card.uuid, frontOverrides);

                // Apply back overrides to back card (if exists)
                if (backCard) {
                    const backOverrides = paramsToOverrides(backParams);
                    onApply(backCard.uuid, backOverrides);
                }
            }

            if (shouldClose) {
                onClose();
            }
        } catch (err) {
            console.error('[CardEditorModal] Apply failed:', err);
        } finally {
            setIsApplying(false);
        }
    }, [card.uuid, backCard, frontParams, backParams, onApply, onApplyToSelected, selectedCardUuids, onClose]);

    const handleApplyToAll = useCallback(() => {
        // Use current face's params for "Apply to All"
        const overrides = paramsToOverrides(params);
        onApplyToAll(overrides);
        onClose();
    }, [params, onApplyToAll, onClose]);

    const handleReset = useCallback(() => {
        // Reset current face to global defaults
        setParams(defaultParams);
        const overrides = paramsToOverrides(defaultParams);

        // In multi-select mode, reset all selected cards
        if (selectedCardUuids && selectedCardUuids.length > 1 && onApplyToSelected) {
            onApplyToSelected(selectedCardUuids, overrides);
        } else {
            // Single card mode
            if (showBack && backCard) {
                onApply(backCard.uuid, overrides);
            } else {
                onApply(card.uuid, overrides);
            }
        }
    }, [card.uuid, backCard, showBack, defaultParams, setParams, onApply, onApplyToSelected, selectedCardUuids]);
    const toggleSection = useCallback((id: string) => {
        setCardEditorSectionCollapsed({
            ...cardEditorSectionCollapsed,
            [id]: !cardEditorSectionCollapsed[id]
        });
    }, [cardEditorSectionCollapsed, setCardEditorSectionCollapsed]);

    // Section IDs for expand/collapse all
    const SECTION_IDS = ['basic', 'enhance', 'darkPixels', 'holographic', 'colorReplace', 'gamma', 'colorEffects', 'borderEffects'];
    const collapsedCount = SECTION_IDS.filter(id => !!cardEditorSectionCollapsed[id]).length;
    const shouldExpand = collapsedCount >= SECTION_IDS.length / 2;

    const toggleAllSections = useCallback(() => {
        // If more than half are collapsed, expand all (false); otherwise collapse all (true)
        // We use reduce to build the new state object
        const newCollapsed = SECTION_IDS.reduce((acc, id) => ({
            ...acc,
            [id]: !shouldExpand
        }), {} as Record<string, boolean>);

        setCardEditorSectionCollapsed(newCollapsed);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shouldExpand, setCardEditorSectionCollapsed]);

    const updateParam = useCallback(<K extends keyof RenderParams>(key: K, value: RenderParams[K]) => {
        setParams(prev => ({ ...prev, [key]: value }));
    }, [setParams]);

    // Render a section by ID using config lookup
    const renderSection = useCallback((id: string) => {
        const config = SECTION_CONFIG[id];
        if (!config) return null;
        const { title, icon, Content } = config;
        return (
            <SortableSection
                key={id}
                id={id}
                title={title}
                icon={icon}
                isOpen={isSectionOpen(id)}
                onToggle={() => toggleSection(id)}
            >
                <Content params={params} updateParam={updateParam} defaultParams={defaultParams} />
            </SortableSection>
        );
    }, [isSectionOpen, toggleSection, params, updateParam, defaultParams]);

    const currentUrl = showBack && backUrl ? backUrl : frontUrl;
    const hasBack = !!backCard; // Check for back card, not just image (allows default cardbacks)
    const currentImage = showBack ? backImage : image;
    const currentDpi = useExportRes
        ? (currentImage?.exportDpi ?? currentImage?.displayDpi ?? '?')
        : (currentImage?.displayDpi ?? '?');

    // Get base texture for CardCanvas (undarkened version for live preview)
    // Note: baseExportBlob may not exist, in which case exportBlob (pre-darkened) is used
    const baseTexture = useMemo(() => {
        if (!currentImage) return null;
        if (useExportRes) {
            // For export resolution: prefer undarkened, fall back to pre-darkened export, then display
            return currentImage.baseExportBlob ?? currentImage.exportBlob ?? currentImage.baseDisplayBlob ?? currentImage.displayBlob ?? null;
        }
        // For display resolution: prefer undarkened base, fall back to pre-darkened
        return currentImage.baseDisplayBlob ?? currentImage.displayBlob ?? null;
    }, [currentImage, useExportRes]);

    // Compute darkness factor from image histogram for auto-adaptive darken effect
    const [computedDarknessFactor, setComputedDarknessFactor] = useState(0.5);
    useEffect(() => {
        if (!baseTexture) {
            setComputedDarknessFactor(0.5);
            return;
        }
        calculateDarknessFactorFromBlob(baseTexture).then(factor => {
            setComputedDarknessFactor(factor);
        });
    }, [baseTexture]);


    return (
        <Modal
            show={isOpen}
            onClose={onClose}
            size="7xl"
            className="card-editor-modal"
            dismissible
        >
            <ModalHeader>
                <div className="flex items-center gap-4">
                    <Palette className="w-5 h-5" />
                    <span>
                        {selectedCount
                            ? `Edit ${selectedCount} Cards (Preview: "${card.name}")`
                            : `Edit: "${card.name}"`
                        }
                    </span>
                </div>
            </ModalHeader>

            <ModalBody className="p-0">
                <div className="flex h-[80vh] max-h-[800px] card-editor-body">
                    {/* Left: Card Preview with pan/zoom */}
                    <div
                        ref={containerRef}
                        className="flex-1 bg-gray-900 flex items-center justify-center overflow-hidden relative select-none card-editor-preview"
                        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        onDoubleClick={() => setPan({ x: 0, y: 0 })}
                        onWheel={handleWheel}
                    >
                        {baseTexture ? (
                            <div
                                className="transition-transform duration-100"
                                style={{
                                    // Apply pan offset - image size grows with zoom
                                    transform: `translate(${pan.x}px, ${pan.y}px)`,
                                    pointerEvents: 'none',
                                }}
                            >
                                {/* Render using shared PixiJS application for WebGL */}
                                <PixiCardPreview
                                    imageBlob={baseTexture}
                                    darknessFactor={computedDarknessFactor}
                                    width={Math.round(PREVIEW_WIDTH * zoom)}
                                    height={Math.round(PREVIEW_HEIGHT * zoom)}
                                    params={showOriginal ? DEFAULT_RENDER_PARAMS : params}
                                    className="rounded-lg shadow-2xl"
                                />
                            </div>
                        ) : currentUrl ? (
                            <div
                                className="transition-transform duration-100"
                                style={{
                                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                                    pointerEvents: 'none',
                                }}
                            >
                                <img
                                    src={currentUrl}
                                    alt={card.name}
                                    className="rounded-lg shadow-2xl"
                                    style={{
                                        width: PREVIEW_WIDTH,
                                        height: PREVIEW_HEIGHT,
                                        objectFit: 'contain',
                                    }}
                                    draggable={false}
                                />
                            </div>
                        ) : (
                            <div className="text-gray-500 text-center">
                                <p>No image available</p>
                                <p className="text-sm mt-2">Process the card first</p>
                            </div>
                        )}

                        {/* Zoom controls - hover on desktop, click-to-toggle on mobile */}
                        {isMobile ? (
                            /* Mobile: click-to-toggle like PageViewFloatingControls */
                            <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2">
                                {showMobileZoomControls && (
                                    <div
                                        ref={mobileZoomControlsRef}
                                        className="bg-white dark:bg-gray-800 p-2 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-64 mb-2"
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onTouchStart={(e) => e.stopPropagation()}
                                    >
                                        <ZoomControls
                                            zoom={zoom}
                                            onZoomChange={(newZoom) => setZoom(newZoom)}
                                            minZoom={0.5}
                                            maxZoom={5.0}
                                        />
                                    </div>
                                )}
                                <button
                                    onClick={() => setShowMobileZoomControls(!showMobileZoomControls)}
                                    className="p-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg text-gray-600 dark:text-gray-400"
                                >
                                    {showMobileZoomControls ? <ZoomOut className="size-5" /> : <ZoomIn className="size-5" />}
                                </button>
                            </div>
                        ) : (
                            /* Desktop: hover to show pattern */
                            <div className="group absolute bottom-4 right-4">
                                {/* Icon-only collapsed state */}
                                <div className="absolute bottom-0 right-0 p-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg cursor-pointer opacity-70 group-hover:opacity-0 transition-opacity duration-500 pointer-events-none">
                                    <ZoomIn className="size-5 text-gray-600 dark:text-gray-400" />
                                </div>

                                {/* Full controls on hover */}
                                <div
                                    className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-500 min-w-[250px]"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onTouchStart={(e) => e.stopPropagation()}
                                >
                                    <ZoomControls
                                        zoom={zoom}
                                        onZoomChange={(newZoom) => setZoom(newZoom)}
                                        minZoom={0.5}
                                        maxZoom={5.0}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Top-right: Flip button (mobile only - like drag handle position) */}
                        {isMobile && hasBack && (
                            <button
                                type="button"
                                className={`absolute top-2 right-2 w-8 h-8 rounded flex items-center justify-center backdrop-blur-sm transition-colors z-10 ${showBack
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-white/90 text-gray-700'
                                    }`}
                                onClick={() => setShowBack(!showBack)}
                                title={showBack ? 'Show front' : 'Show back'}
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        )}

                        {/* Top-left: Front/Back toggle + DPI switch (desktop) */}
                        <div className={`absolute top-4 left-4 flex items-center gap-1 ${isMobile ? 'hidden' : ''}`}>
                            {/* Front/Back flip button - matches SortableCard style */}
                            <button
                                type="button"
                                className={`flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-l backdrop-blur-sm transition-colors ${showBack
                                    ? 'bg-blue-500 text-white cursor-pointer'
                                    : hasBack
                                        ? 'bg-white/90 dark:bg-gray-800/90 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer'
                                        : 'bg-gray-800/90 text-gray-500 cursor-default'
                                    }`}
                                onClick={() => hasBack && setShowBack(!showBack)}
                                disabled={!hasBack}
                                title={hasBack ? (showBack ? 'Show front' : 'Show back') : 'No back image'}
                            >
                                <RefreshCw className="w-3 h-3" />
                                <span>{showBack ? 'Back' : 'Front'}</span>
                            </button>

                            {/* DPI toggle button */}
                            <button
                                type="button"
                                className={`text-xs px-2 py-1.5 rounded-r backdrop-blur-sm transition-colors ${useExportRes
                                    ? 'bg-green-600/90 hover:bg-green-500 text-white'
                                    : 'bg-gray-700/90 hover:bg-gray-600 text-gray-200'
                                    }`}
                                onClick={() => setUseExportRes(!useExportRes)}
                                title={`Click to switch to ${useExportRes ? 'display' : 'export'} resolution`}
                            >
                                {currentDpi} DPI
                                <span className="text-gray-300 ml-1 opacity-75">
                                    ({useExportRes ? 'export' : 'display'})
                                </span>
                            </button>
                        </div>

                        {/* Show Original toggle - bottom-left to avoid overlap */}
                        <button
                            type="button"
                            className={`absolute bottom-4 left-4 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded backdrop-blur-sm transition-colors ${showOriginal
                                ? 'bg-amber-600/90 hover:bg-amber-500 text-white'
                                : 'bg-gray-700/90 hover:bg-gray-600 text-gray-200'
                                }`}
                            onClick={() => setShowOriginal(!showOriginal)}
                            title={showOriginal ? 'Show with adjustments' : 'Show original (no effects)'}
                        >
                            {showOriginal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            {showOriginal ? 'Original' : 'Adjusted'}
                        </button>

                        {/* Reset button */}
                        {isDirty && (
                            <button
                                type="button"
                                className="absolute top-4 right-4 flex items-center gap-1 text-xs text-gray-400 bg-gray-800/90 px-2 py-1 rounded backdrop-blur-sm hover:bg-gray-700"
                                onClick={handleReset}
                                title="Reset to global defaults"
                            >
                                <RotateCcw className="w-3 h-3" />
                                Reset
                            </button>
                        )}
                    </div>

                    {/* Right: Settings Panel */}
                    <div className="w-80 bg-gray-100 dark:bg-gray-700 border-l border-gray-300 dark:border-gray-700 overflow-y-auto settings-panel-scroll flex flex-col card-editor-settings">
                        {/* Panel Header with Expand/Collapse All - matches Settings panel */}
                        <div className="sticky top-0 z-20 bg-gray-100 dark:bg-gray-700 flex items-center justify-between p-4 shrink-0 border-b border-gray-300 dark:border-gray-600">
                            <h2 className="text-2xl font-semibold dark:text-white">
                                Adjustments
                            </h2>
                            <button
                                onClick={toggleAllSections}
                                className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors"
                                aria-label={shouldExpand ? "Expand all sections" : "Collapse all sections"}
                                title={shouldExpand ? "Expand All" : "Collapse All"}
                            >
                                {shouldExpand ? <ChevronsDown className="size-6" /> : <ChevronsUp className="size-6" />}
                            </button>
                        </div>
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={cardEditorSectionOrder}
                                strategy={verticalListSortingStrategy}
                            >
                                {cardEditorSectionOrder.map((id) => renderSection(id))}
                            </SortableContext>
                        </DndContext>
                    </div>
                </div>
            </ModalBody>

            <ModalFooter>
                <div className="card-editor-footer">
                    <Button color="gray" onClick={onClose}>
                        {selectedCount ? 'Close' : 'Cancel'}
                    </Button>

                    <div className="card-editor-footer-right">
                        <Button
                            color="light"
                            onClick={handleApplyToAll}
                        >
                            Apply to All
                        </Button>

                        <Button
                            color="green"
                            onClick={() => handleApply(false)}
                            disabled={isApplying}
                        >
                            {selectedCount ? `Apply to ${selectedCount}` : 'Apply'}
                        </Button>

                        <Button
                            color="blue"
                            onClick={() => handleApply(true)}
                            disabled={isApplying}
                        >
                            {isApplying
                                ? 'Applying...'
                                : selectedCount
                                    ? `Apply to ${selectedCount} & Close`
                                    : 'Apply & Close'
                            }
                        </Button>
                    </div>
                </div>
            </ModalFooter>
        </Modal>
    );
}

export default CardEditorModal;
