/**
 * PixiVirtualCanvas Component
 * 
 * Single PixiJS Application that renders ALL pages, cut guides, and cards.
 * Uses viewport-sized canvas with internal scroll/zoom transforms.
 * Only 1 WebGL context regardless of page count.
 */

import { useRef, useEffect, useLayoutEffect, useState, useCallback, memo } from 'react';
import { Application, Container, Sprite as PixiSprite, Texture, Graphics } from 'pixi.js';
import { DarkenFilter, AdjustmentFilter } from './filters';
import {
    pixiSingleton,
    resetPixiSingleton,
    setPixiApp,
} from './pixiSingleton';
import { calculateHoloAnimation, type HoloAnimationStyle } from './holoAnimation';
import { usePageGuides } from './usePageGuides';
import { usePerCardGuides } from './usePerCardGuides';
import { useRegistrationMarks } from './useRegistrationMarks';
import {
    hasActiveAdjustments,
    applyDarkenFilter,
    applyAdjustmentFilter,
    calculateCardHoloAnimation,
    destroySpriteData,
    type SpriteData,
} from './cardFilterUtils';
import type { CardOption } from '../../../../shared/types';
import type { DarkenMode } from '../../store/settings';
import { useSettingsStore } from '../../store/settings';

// --- Types ---

export interface CardWithGlobalLayout {
    card: CardOption;
    imageBlob?: Blob;
    backBlob?: Blob;
    frontImageId?: string; // For artwork change detection
    backImageId?: string;
    backOverrides?: CardOption['overrides']; // Back card's overrides for per-face rendering
    darknessFactor: number;
    // Position in pixels relative to page content origin (before zoom)
    globalX: number;
    globalY: number;
    width: number;
    height: number;
    // Bleed for cut guide rendering
    bleedMm: number;
    // Base card dimensions (without bleed)
    baseCardWidthMm: number;
    baseCardHeightMm: number;
    // Precomputed hashes for fast memo comparison (avoids JSON.stringify on every render)
    overridesHash?: string;
    backOverridesHash?: string;
}

export interface PageLayoutInfo {
    pageIndex: number;
    pageWidthPx: number;
    pageHeightPx: number;
    pageYOffset: number; // Y position of this page (including gap)
}

interface PixiVirtualCanvasProps {
    cards: CardWithGlobalLayout[];
    pages: PageLayoutInfo[];
    viewportWidth: number;
    viewportHeight: number;
    scrollTop: number; // Still needed for React-based calculations (viewport culling)
    scrollContainerRef?: React.RefObject<HTMLDivElement | null>; // For synchronous scroll updates
    zoom: number;
    globalDarkenMode: DarkenMode;
    flippedCards: Set<string>;
    activeId?: string | null;
    // Layout settings for page cut guides
    guideWidth: number;
    cutLineStyle: 'none' | 'full' | 'edges';
    // Per-card guide settings
    perCardGuideStyle: 'corners' | 'rounded-corners' | 'dashed-corners' | 'dashed-rounded-corners' | 'solid-squared-rect' | 'dashed-squared-rect' | 'dashed-rounded-rect' | 'solid-rounded-rect' | 'none';
    perCardGuideColor: number; // Hex color for PixiJS (e.g., 0x39FF14)
    perCardGuidePlacement: 'inside' | 'outside' | 'center';
    cutGuideLengthMm: number; // Length of corner guides in mm
    // Registration marks
    registrationMarks: 'none' | '3' | '4';
    registrationMarksPortrait: boolean;
    // Theme
    isDarkMode: boolean;
    // Callback when card textures are loaded (for placeholder hiding)
    onRenderedCardsChange?: (renderedCardUuids: Set<string>) => void;
    className?: string;
    style?: React.CSSProperties;
}

// Margin above/below viewport to pre-render cards (increased for smoother scrolling)
const RENDER_MARGIN = 1000;

// Number of cards to pre-initialize on startup (four pages worth)
const PRE_INIT_COUNT = 36;

// Blank cardback ID - cards with this back should show white when flipped
const BLANK_CARDBACK_ID = 'cardback_builtin_blank';


function PixiVirtualCanvasInner({
    cards,
    pages,
    viewportWidth,
    viewportHeight,
    scrollTop,
    scrollContainerRef,
    zoom,
    globalDarkenMode,
    flippedCards,
    activeId,
    guideWidth,
    cutLineStyle,
    perCardGuideStyle,
    perCardGuideColor,
    perCardGuidePlacement,
    cutGuideLengthMm,
    registrationMarks,
    registrationMarksPortrait,
    isDarkMode,
    onRenderedCardsChange,
    className,
    style,
}: PixiVirtualCanvasProps) {
    // Subscribe to global darken settings for reactivity (trigger re-render on change)
    const globalDarkenContrast = useSettingsStore((s) => s.darkenContrast);
    const globalDarkenEdgeWidth = useSettingsStore((s) => s.darkenEdgeWidth);
    const globalDarkenAmount = useSettingsStore((s) => s.darkenAmount);
    const globalDarkenBrightness = useSettingsStore((s) => s.darkenBrightness);
    const globalDarkenAutoDetect = useSettingsStore((s) => s.darkenAutoDetect);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const appRef = useRef<Application | null>(null);
    const worldContainerRef = useRef<Container | null>(null);
    const pagesContainerRef = useRef<Container | null>(null);
    const pageGuidesContainerRef = useRef<Container | null>(null); // Page guides under cards
    const cardsContainerRef = useRef<Container | null>(null);
    const guidesContainerRef = useRef<Container | null>(null); // Per-card guides on top of cards
    const spritesRef = useRef<Map<string, SpriteData>>(new Map());
    const pageGraphicsRef = useRef<Map<number, Graphics>>(new Map());
    const updateCounterRef = useRef(0); // Track update calls to prevent race conditions
    const [isReady, setIsReady] = useState(false);

    // Store dimensions in ref for init effect to access
    const dimensionsRef = useRef({ width: viewportWidth, height: viewportHeight });
    dimensionsRef.current = { width: viewportWidth, height: viewportHeight };

    // Store zoom in ref for init effect to access (avoids stale closure issue)
    const zoomRef = useRef(zoom);
    zoomRef.current = zoom;

    // Track the card that was just dropped
    const [recentlyDroppedId, setRecentlyDroppedId] = useState<string | null>(null);
    const previousActiveIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (previousActiveIdRef.current && !activeId) {
            setRecentlyDroppedId(previousActiveIdRef.current);
            const timer = setTimeout(() => setRecentlyDroppedId(null), 200);
            return () => clearTimeout(timer);
        }
        previousActiveIdRef.current = activeId ?? null;
    }, [activeId]);

    // Holographic animation state
    const holoAngleRef = useRef(45); // Default angle
    const holoStrengthRef = useRef(50); // Default strength (animated for pulse)
    const lastAnimationTimeRef = useRef(performance.now());
    const [holoAnimationTick, setHoloAnimationTick] = useState(0);

    // Check if any card has holographic effect enabled
    const hasHoloCards = cards.some(({ card }) => {
        const overrides = card.overrides;
        return overrides?.holoEffect && overrides.holoEffect !== 'none';
    });

    // Trigger immediate re-render when holo settings change (especially for static 'none' animation mode)
    const holoSettingsKey = cards.map(c =>
        `${c.card.overrides?.holoEffect}:${c.card.overrides?.holoAnimation}:${c.card.overrides?.holoSpeed}:${c.card.overrides?.holoStrength}:${c.card.overrides?.holoSweepWidth}`
    ).join(',');

    useEffect(() => {
        if (!isReady) return;
        // Trigger a tick to force re-render when holo settings change
        setHoloAnimationTick(t => t + 1);
    }, [isReady, holoSettingsKey]);

    // Holographic animation effect
    // Store cards in ref so animation loop doesn't need cards in deps
    const cardsRef = useRef(cards);
    cardsRef.current = cards;

    useEffect(() => {
        // Respect user's motion preferences
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!hasHoloCards || !isReady || prefersReducedMotion) return;

        let intervalId: ReturnType<typeof setInterval> | null = null;

        const animate = () => {
            const now = performance.now();
            const delta = (now - lastAnimationTimeRef.current) / 1000;
            lastAnimationTimeRef.current = now;

            // Find any card with auto animation and get its settings
            // Use ref to avoid depending on cards array
            let hasAutoAnimation = false;
            let animationStyle = 'wave';
            let speed = 5;
            let baseStrength = 50;

            for (const { card } of cardsRef.current) {
                const overrides = card.overrides;
                if (overrides?.holoEffect && overrides.holoEffect !== 'none' &&
                    overrides.holoAnimation && overrides.holoAnimation !== 'none') {
                    hasAutoAnimation = true;
                    animationStyle = overrides.holoAnimation;
                    speed = overrides.holoSpeed ?? 5;
                    baseStrength = overrides.holoStrength ?? 50;
                    break;
                }
            }

            if (hasAutoAnimation) {
                const result = calculateHoloAnimation(
                    animationStyle as HoloAnimationStyle,
                    now,
                    speed,
                    baseStrength,
                    holoAngleRef.current,
                    delta
                );
                holoAngleRef.current = result.angle;
                holoStrengthRef.current = result.strength;
            }

            setHoloAnimationTick(t => t + 1);
        };

        intervalId = setInterval(animate, 50); // 20 FPS

        return () => { if (intervalId) clearInterval(intervalId); };
        // Stable deps only - cards accessed via ref
    }, [hasHoloCards, isReady]);

    // Initialize PixiJS Application - TRUE SINGLETON pattern
    // Only allows one initialization, reuses existing app
    useEffect(() => {
        if (!canvasRef.current) return;

        const canvas = canvasRef.current;
        const sprites = spritesRef.current;

        // If singleton already initialized and valid, just reuse it
        if (pixiSingleton.app && pixiSingleton.app.stage) {
            // Reattach refs to existing singleton
            appRef.current = pixiSingleton.app;
            worldContainerRef.current = pixiSingleton.worldContainer;
            pagesContainerRef.current = pixiSingleton.pagesContainer;
            cardsContainerRef.current = pixiSingleton.cardsContainer;
            guidesContainerRef.current = pixiSingleton.guidesContainer;
            // Set initial zoom scale on reattach
            if (pixiSingleton.worldContainer) {
                pixiSingleton.worldContainer.scale.set(zoomRef.current);
            }
            setIsReady(true);
            return;
        }

        // If currently initializing, wait for it
        if (pixiSingleton.isInitializing) {
            // Wait for existing init to complete, then attach
            const waitForInit = async () => {
                if (pixiSingleton.initPromise) {
                    await pixiSingleton.initPromise;
                }
                if (pixiSingleton.app) {
                    appRef.current = pixiSingleton.app;
                    worldContainerRef.current = pixiSingleton.worldContainer;
                    pagesContainerRef.current = pixiSingleton.pagesContainer;
                    cardsContainerRef.current = pixiSingleton.cardsContainer;
                    guidesContainerRef.current = pixiSingleton.guidesContainer;
                    // Set initial zoom scale when recovering
                    if (pixiSingleton.worldContainer) {
                        pixiSingleton.worldContainer.scale.set(zoomRef.current);
                    }
                    setIsReady(true);
                }
            };
            waitForInit();
            return;
        }

        // Clean up any invalid singleton (stage destroyed)
        if (pixiSingleton.app && !pixiSingleton.app.stage) {
            resetPixiSingleton();
        }

        // Start initialization - set flag immediately to prevent duplicates
        pixiSingleton.isInitializing = true;

        const initApp = async () => {
            const newApp = new Application();

            try {
                const { width, height } = dimensionsRef.current;
                await newApp.init({
                    canvas,
                    width: width || 816,
                    height: height || 1056,
                    backgroundAlpha: 0,
                    antialias: true,
                    resolution: window.devicePixelRatio || 1,
                    autoDensity: true,
                    autoStart: false,
                    powerPreference: 'high-performance',
                    preferWebGLVersion: 2,
                });
                newApp.ticker.stop();
            } catch (e) {
                console.warn('[PixiVirtualCanvas] Init failed:', e);
                pixiSingleton.isInitializing = false;
                return;
            }

            // Create container hierarchy
            const worldContainer = new Container();
            worldContainer.label = 'world-container';
            // Set initial zoom scale immediately on creation
            worldContainer.scale.set(zoomRef.current);
            newApp.stage.addChild(worldContainer);

            const pagesContainer = new Container();
            pagesContainer.label = 'pages-container';
            worldContainer.addChild(pagesContainer);

            // Page cut guides: UNDER cards
            const pageGuidesContainer = new Container();
            pageGuidesContainer.label = 'page-guides-container';
            worldContainer.addChild(pageGuidesContainer);

            const cardsContainer = new Container();
            cardsContainer.label = 'cards-container';
            worldContainer.addChild(cardsContainer);

            // Per-card cut guides: ON TOP of cards
            const guidesContainer = new Container();
            guidesContainer.label = 'per-card-guides-container';
            worldContainer.addChild(guidesContainer);

            // Store in singleton
            pixiSingleton.app = newApp;
            pixiSingleton.canvas = canvas;
            pixiSingleton.worldContainer = worldContainer;
            pixiSingleton.pagesContainer = pagesContainer;
            pixiSingleton.pageGuidesContainer = pageGuidesContainer;
            pixiSingleton.cardsContainer = cardsContainer;
            pixiSingleton.guidesContainer = guidesContainer;
            pixiSingleton.isInitializing = false;

            // Expose app for PixiCardPreview to use
            setPixiApp(newApp);

            // Store in refs
            appRef.current = newApp;
            worldContainerRef.current = worldContainer;
            pagesContainerRef.current = pagesContainer;
            pageGuidesContainerRef.current = pageGuidesContainer;
            cardsContainerRef.current = cardsContainer;
            guidesContainerRef.current = guidesContainer;
            setIsReady(true);
        };

        pixiSingleton.initPromise = initApp();

        // Capture refs for cleanup (must be done before return per React lint)
        const pageGraphics = pageGraphicsRef.current;
        const blobUrls = blobUrlsRef.current;

        // Cleanup only clears component-local resources, not the singleton
        return () => {
            setIsReady(false);

            // Clean up card sprites (component-local)
            try {
                sprites.forEach((data) => destroySpriteData(data));
                sprites.clear();
            } catch {
                // Ignore
            }

            // Clean up page graphics
            try {
                pageGraphics.forEach((g) => {
                    try { g?.destroy(); } catch { /* ignore */ }
                });
                pageGraphics.clear();
            } catch {
                // Ignore
            }


            // Clean up blob URLs
            try {
                blobUrls.forEach((url) => {
                    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
                });
                blobUrls.clear();
            } catch {
                // Ignore
            }

            // Reset singleton on unmount to get fresh WebGL context on remount
            // This is important when key changes to force a clean reinit
            resetPixiSingleton();

            appRef.current = null;
            worldContainerRef.current = null;
            pagesContainerRef.current = null;
            cardsContainerRef.current = null;
            guidesContainerRef.current = null;
        };
    }, []);

    // Resize canvas when viewport changes
    useEffect(() => {
        if (!appRef.current) return;
        try {
            appRef.current.renderer.resize(viewportWidth, viewportHeight);
            appRef.current.render();
        } catch (e) {
            console.warn('[PixiVirtualCanvas] Resize failed:', e);
        }
    }, [viewportWidth, viewportHeight]);

    // Update world container zoom (separate from scroll for clarity)
    useLayoutEffect(() => {
        if (!worldContainerRef.current) return;
        worldContainerRef.current.scale.set(zoom);
    }, [zoom]);

    // Synchronous scroll handling - bypasses React render cycle for perfect sync with CardControlsOverlay
    useEffect(() => {
        const scrollContainer = scrollContainerRef?.current;
        const world = worldContainerRef.current;
        const app = appRef.current;
        if (!world || !app) return;

        const handleScroll = () => {
            const currentScrollTop = scrollContainer?.scrollTop ?? scrollTop;
            // world.y is in screen coordinates, so applies directly
            // Zoom is handled by world.scale, so we don't divide here
            world.y = -currentScrollTop;
            // Immediate render for synchronous visual update
            app.render();
        };

        // Initial position
        handleScroll();

        if (scrollContainer) {
            scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
            return () => scrollContainer.removeEventListener('scroll', handleScroll);
        }
    }, [scrollContainerRef, scrollTop, zoom]);

    // Track blob URLs for cleanup
    const blobUrlsRef = useRef<Map<string, string>>(new Map());
    useEffect(() => {
        const urls = blobUrlsRef.current;
        return () => {
            urls.forEach((url) => URL.revokeObjectURL(url));
            urls.clear();
        };
    }, []);

    // Create texture from blob - uses Image element for reliable loading
    const createTexture = useCallback(async (blob: Blob, cacheKey: string): Promise<Texture | null> => {
        const existingUrl = blobUrlsRef.current.get(cacheKey);
        let url: string;

        if (existingUrl) {
            url = existingUrl;
        } else {
            url = URL.createObjectURL(blob);
            blobUrlsRef.current.set(cacheKey, url);
        }

        try {
            // Create an Image element to load the blob
            const img = new Image();
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject(new Error('Image load failed'));
                img.src = url;
            });

            // Create texture from the loaded image
            return Texture.from(img);
        } catch (e) {
            console.warn('[PixiVirtualCanvas] Failed to create texture:', e);
            URL.revokeObjectURL(url);
            blobUrlsRef.current.delete(cacheKey);
            return null;
        }
    }, []);

    // Render page backgrounds
    useEffect(() => {
        if (!isReady || !pagesContainerRef.current) return;
        const container = pagesContainerRef.current;
        const existingGraphics = pageGraphicsRef.current;

        // Remove pages that no longer exist
        const currentPageIndices = new Set(pages.map(p => p.pageIndex));
        existingGraphics.forEach((g, idx) => {
            if (!currentPageIndices.has(idx)) {
                container.removeChild(g);
                g.destroy();
                existingGraphics.delete(idx);
            }
        });

        // Create/update page backgrounds
        // gray-700 = #374151 = 0x374151
        const pageColor = isDarkMode ? 0x374151 : 0xffffff;
        pages.forEach((page) => {
            let g = existingGraphics.get(page.pageIndex);
            if (!g) {
                g = new Graphics();
                container.addChild(g);
                existingGraphics.set(page.pageIndex, g);
            }

            g.clear();
            // Page background with theme color
            g.rect(0, page.pageYOffset, page.pageWidthPx, page.pageHeightPx);
            g.fill({ color: pageColor });
        });

        if (appRef.current) {
            appRef.current.render();
        }
    }, [isReady, pages, isDarkMode]);

    // Page-level cut guides - delegated to hook
    usePageGuides({
        isReady,
        container: pageGuidesContainerRef.current,
        app: appRef.current,
        pages,
        cards,
        cutLineStyle,
        guideWidth,
    });

    // Per-card cut guides - delegated to hook
    usePerCardGuides({
        isReady,
        container: guidesContainerRef.current,
        app: appRef.current,
        cards,
        guideStyle: perCardGuideStyle,
        guideColor: perCardGuideColor,
        guidePlacement: perCardGuidePlacement,
        guideWidth,
        cutGuideLengthMm,
        activeId,
    });

    // Registration marks - delegated to hook (use guidesContainer so marks render on top)
    useRegistrationMarks({
        isReady,
        container: guidesContainerRef.current,
        app: appRef.current,
        pages,
        registrationMarks,
        registrationMarksPortrait,
    });

    // Update card sprites
    useEffect(() => {
        if (!isReady || !cardsContainerRef.current) return;
        const container = cardsContainerRef.current;
        const sprites = spritesRef.current;

        // Increment counter to track this update call
        const thisUpdate = ++updateCounterRef.current;
        const isStale = () => updateCounterRef.current !== thisUpdate;

        const updateSprites = async () => {
            // If already stale, skip entirely
            if (isStale()) return;

            const currentCardIds = new Set(cards.map(c => c.card.uuid));

            // Helper to clean up sprite and revoke blob URLs
            const cleanupSprite = (uuid: string) => {
                const data = sprites.get(uuid);
                if (!data) return;

                try {
                    container.removeChild(data.sprite);
                    destroySpriteData(data);
                } catch (e) {
                    console.warn('[PixiVirtualCanvas] Error removing sprite:', e);
                }

                // Revoke blob URLs to free memory (fix for ERR_BLOB_OUT_OF_MEMORY)
                const frontKey = `front-${uuid}`;
                const backKey = `back-${uuid}`;
                const oldFrontUrl = blobUrlsRef.current.get(frontKey);
                const oldBackUrl = blobUrlsRef.current.get(backKey);

                if (oldFrontUrl) {
                    URL.revokeObjectURL(oldFrontUrl);
                    blobUrlsRef.current.delete(frontKey);
                }
                if (oldBackUrl) {
                    URL.revokeObjectURL(oldBackUrl);
                    blobUrlsRef.current.delete(backKey);
                }
                sprites.delete(uuid);
            };

            // Remove sprites for cards that no longer exist
            sprites.forEach((_, uuid) => {
                if (!currentCardIds.has(uuid)) {
                    cleanupSprite(uuid);
                }
            });

            // Calculate visible range (in content coordinates, accounting for zoom)
            const visibleTop = scrollTop / zoom - RENDER_MARGIN;
            const visibleBottom = (scrollTop + viewportHeight) / zoom + RENDER_MARGIN;

            // Create/update sprites for visible cards
            for (let i = 0; i < cards.length; i++) {
                // Check if stale before processing each card
                if (isStale()) return;

                const { card, imageBlob, backBlob, frontImageId, backImageId, backOverrides, darknessFactor, globalX, globalY, width, height } = cards[i];
                const uuid = card.uuid;

                // Check if card is visible OR should be pre-initialized
                const cardBottom = globalY + height;
                const cardTop = globalY;
                const shouldPreInit = i < PRE_INIT_COUNT;
                const isInView = cardBottom >= visibleTop && cardTop <= visibleBottom;

                // Skip if being dragged
                if (activeId === uuid || recentlyDroppedId === uuid) {
                    const existing = sprites.get(uuid);
                    if (existing) {
                        existing.sprite.visible = false;
                    }
                    continue;
                }

                // If sprite exists but is now out of view (and not in pre-init range), destroy it to free memory
                if (sprites.has(uuid) && !isInView && !shouldPreInit) {
                    cleanupSprite(uuid);
                    continue;
                }

                // Skip if not visible and not pre-init
                if (!isInView && !shouldPreInit) {
                    continue;
                }

                // Get or create sprite
                let spriteData = sprites.get(uuid);
                const isFlipped = flippedCards.has(uuid);

                // Check if artwork has changed (imageId changed = different artwork selected)
                const frontBlobSize = imageBlob?.size ?? 0;
                const backBlobSize = backBlob?.size;
                const artworkChanged = spriteData && (
                    spriteData.frontImageId !== frontImageId ||
                    spriteData.backImageId !== backImageId ||
                    spriteData.frontBlobSize !== frontBlobSize ||
                    spriteData.backBlobSize !== backBlobSize
                );

                // If artwork changed, destroy old sprite data and recreate
                if (artworkChanged && spriteData) {
                    cleanupSprite(uuid);
                    spriteData = undefined;
                }

                if (!spriteData) {
                    let frontTexture: Texture | null = null;
                    let isPlaceholder = false;

                    if (!imageBlob) {
                        // Create placeholder texture (black)
                        frontTexture = Texture.WHITE;
                        isPlaceholder = true;
                    } else {
                        // Check staleness again before async operations
                        if (isStale()) return;

                        frontTexture = await createTexture(imageBlob, `front-${uuid}`);

                        // Check staleness after async
                        if (isStale()) {
                            // If texture creation failed or stale, cleanup handled by next pass or cache eviction
                            continue;
                        }
                    }

                    if (!frontTexture) continue;

                    let backTexture: Texture | undefined;
                    if (backBlob) {
                        backTexture = (await createTexture(backBlob, `back-${uuid}`)) ?? undefined;
                        if (isStale()) return;
                    }

                    // Determine initial texture
                    const initialTexture = isFlipped && backTexture ? backTexture : frontTexture;

                    const sprite = new PixiSprite(initialTexture);

                    if (isPlaceholder) {
                        sprite.tint = 0x000000; // Black tint for placeholder
                    }

                    const darkenFilter = new DarkenFilter();
                    const adjustFilter = new AdjustmentFilter();
                    sprite.filters = [darkenFilter, adjustFilter];

                    container.addChild(sprite);

                    spriteData = {
                        sprite,
                        darkenFilter,
                        adjustFilter,
                        frontTexture: frontTexture!, // Store placeholder texture (Texture.WHITE) so sprite remains valid
                        backTexture,
                        frontBlobSize,
                        backBlobSize,
                        frontImageId,
                        backImageId,
                        isPlaceholder, // Flag to indicate this is a placeholder
                    };
                    sprites.set(uuid, spriteData);
                }

                const { sprite, darkenFilter, adjustFilter, frontTexture, backTexture } = spriteData;

                // Check if this is a blank cardback (should be transparent when flipped)
                const isBlankBack = backImageId === BLANK_CARDBACK_ID;
                // Hide sprite if:
                // - Flipped with blank cardback, OR
                // - Flipped but back texture is still loading (not yet available)
                const isBackLoading = isFlipped && !backTexture && !isBlankBack;
                const shouldHide = (isFlipped && isBlankBack) || isBackLoading;

                // Update texture based on flip state - skip texture update if hidden
                if (!shouldHide) {
                    const targetTexture = isFlipped && backTexture ? backTexture : frontTexture;
                    if (sprite.texture !== targetTexture) {
                        sprite.texture = targetTexture;
                    }
                }

                // Update position and size (in content coordinates - zoom applied by container)
                sprite.x = globalX;
                sprite.y = globalY;
                sprite.width = width;
                sprite.height = height;
                // Hide sprite if blank cardback or back is loading
                sprite.visible = !shouldHide;

                // Update filters based on card overrides and global settings
                // Use back overrides when flipped, front overrides otherwise
                const overrides = isFlipped ? (backOverrides ?? card.overrides) : card.overrides;
                const textureSize: [number, number] = [width, height];

                // Apply darken filter
                applyDarkenFilter(darkenFilter, overrides, {
                    darkenMode: globalDarkenMode,
                    darkenContrast: globalDarkenContrast,
                    darkenEdgeWidth: globalDarkenEdgeWidth,
                    darkenAmount: globalDarkenAmount,
                    darkenBrightness: globalDarkenBrightness,
                    darkenAutoDetect: globalDarkenAutoDetect,
                }, darknessFactor, textureSize);

                // Calculate holo animation and apply adjustment filter
                const holoAnimation = calculateCardHoloAnimation(overrides);
                applyAdjustmentFilter(adjustFilter, overrides, textureSize, holoAnimation);

                // Compute UV correction for holo effects when card is partially clipped by screen
                // Get current scroll position directly from container for better sync (avoids lag from React state)
                const currentScrollTop = scrollContainerRef?.current?.scrollTop ?? scrollTop;
                const screenTop = currentScrollTop / zoom;
                const screenBottom = (currentScrollTop + viewportHeight) / zoom;
                const cardClippedTop = Math.max(cardTop, screenTop);
                const cardClippedBottom = Math.min(cardBottom, screenBottom);
                const clippedHeight = cardClippedBottom - cardClippedTop;

                // Calculate the UV offset (how far down the card the visible portion starts)
                // and UV scale (what fraction of the card is visible)
                if (clippedHeight < height && clippedHeight > 0) {
                    // Card is partially clipped - shader needs UV correction
                    const uvOffsetY = (cardClippedTop - cardTop) / height;
                    const uvScaleY = clippedHeight / height;
                    adjustFilter.holoUvOffset = [0, uvOffsetY];
                    adjustFilter.holoUvScale = [1, uvScaleY];
                } else {
                    // Card is fully visible (or not visible at all) - no correction needed
                    adjustFilter.holoUvOffset = [0, 0];
                    adjustFilter.holoUvScale = [1, 1];
                }

                // Build filter array based on what's needed
                const effectiveMode = overrides?.darkenMode ?? globalDarkenMode;
                const filters: import('pixi.js').Filter[] = [];

                if (effectiveMode !== 'none') {
                    filters.push(darkenFilter);
                }

                if (hasActiveAdjustments(overrides)) {
                    filters.push(adjustFilter);
                }

                sprite.filters = filters.length > 0 ? filters : null;
            }

            // Render only if still current
            if (!isStale() && appRef.current) {
                try {
                    appRef.current.render();
                } catch (e) {
                    console.warn('[PixiVirtualCanvas] Render failed:', e);
                }
            }

            // Report which cards have loaded textures (for placeholder hiding)
            // Exclude placeholders and flipped cards without a valid back texture
            if (onRenderedCardsChange && !isStale()) {
                const renderedUuids = new Set<string>();
                sprites.forEach((spriteData, uuid) => {
                    // Skip if this is a placeholder (front image not loaded)
                    if (spriteData.isPlaceholder) return;

                    // If card is flipped, check if backTexture exists
                    const isFlipped = flippedCards.has(uuid);
                    if (isFlipped && !spriteData.backTexture) return;

                    renderedUuids.add(uuid);
                });
                onRenderedCardsChange(renderedUuids);
            }
        };

        updateSprites();

        // No cleanup needed - staleness is tracked by counter
        // Include serialized holo params to detect nested override changes
    }, [
        isReady,
        cards,
        isDarkMode,
        activeId,
        recentlyDroppedId,
        scrollTop,
        viewportHeight,
        zoom,
        globalDarkenMode,
        globalDarkenContrast,
        globalDarkenEdgeWidth,
        globalDarkenAmount,
        globalDarkenBrightness,
        globalDarkenAutoDetect,
        flippedCards,
        createTexture,
        onRenderedCardsChange,
        holoAnimationTick,
        holoSettingsKey,
        scrollContainerRef
    ]);

    return (
        <canvas
            ref={canvasRef}
            data-testid="pixi-virtual-canvas"
            width={viewportWidth}
            height={viewportHeight}
            className={className}
            style={{
                ...style,
                width: viewportWidth,
                height: viewportHeight,
            }}
        />
    );
}

// Props that need simple equality check (reference or primitive)
const SHALLOW_COMPARE_KEYS: (keyof PixiVirtualCanvasProps)[] = [
    'viewportWidth', 'viewportHeight', 'scrollTop', 'zoom',
    'globalDarkenMode', 'flippedCards', 'activeId',
    'guideWidth', 'cutLineStyle', 'perCardGuideStyle',
    'perCardGuideColor', 'perCardGuidePlacement', 'cutGuideLengthMm', 'isDarkMode', 'pages',
    'registrationMarks', 'registrationMarksPortrait',
];

// Card properties that need simple equality check
const CARD_SHALLOW_KEYS: (keyof CardWithGlobalLayout)[] = [
    'imageBlob', 'backBlob', 'globalX', 'globalY', 'width', 'height', 'darknessFactor',
    'frontImageId', 'backImageId', // Important for detecting artwork changes even if blob refs stay same
];

function arePropsEqual(prevProps: PixiVirtualCanvasProps, nextProps: PixiVirtualCanvasProps): boolean {
    // Check all shallow-compare props
    for (const key of SHALLOW_COMPARE_KEYS) {
        if (prevProps[key] !== nextProps[key]) return false;
    }

    // Deep-compare cards array
    const prevCards = prevProps.cards;
    const nextCards = nextProps.cards;
    if (prevCards.length !== nextCards.length) return false;

    for (let i = 0; i < prevCards.length; i++) {
        const prev = prevCards[i];
        const next = nextCards[i];

        // Check UUID first (different card entirely)
        if (prev.card.uuid !== next.card.uuid) return false;

        // Check shallow card properties
        for (const key of CARD_SHALLOW_KEYS) {
            if (prev[key] !== next[key]) return false;
        }

        // Compare using precomputed hashes (faster than JSON.stringify on every render)
        if (prev.overridesHash !== next.overridesHash) return false;
        if (prev.backOverridesHash !== next.backOverridesHash) return false;
    }

    return true;
}

const PixiVirtualCanvas = memo(PixiVirtualCanvasInner, arePropsEqual);
export default PixiVirtualCanvas;
