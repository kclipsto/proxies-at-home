/**
 * PixiCardPreview Component
 * 
 * Renders a single card preview using the shared PixiJS Application.
 * Used by CardEditorModal for live preview with WebGL filters.
 */

import { useRef, useEffect, useState, memo } from 'react';
import { Container, Sprite as PixiSprite, Texture, RenderTexture } from 'pixi.js';
import { DarkenFilter, AdjustmentFilter } from './filters';
import { getPixiApp } from './pixiSingleton';
import { calculateHoloAnimation, type HoloAnimationStyle } from './holoAnimation';
import { useSettingsStore } from '@/store/settings';
import {
    applyDarkenFilter,
    applyAdjustmentFilter,
    type CardOverrides
} from './cardFilterUtils';
import type { RenderParams } from '../CardCanvas/types';
import { hasActiveAdjustments } from '@/helpers/adjustmentUtils';
import { CONSTANTS } from "@/constants/commonConstants";

interface PixiCardPreviewProps {
    /** Image blob to render */
    imageBlob: Blob | null;
    /** Render parameters */
    params: RenderParams;
    /** Pre-computed darkness factor */
    darknessFactor: number;
    /** Preview width in pixels */
    width: number;
    /** Preview height in pixels */
    height: number;
    /** Additional CSS class */
    className?: string;
    /** Additional inline styles */
    style?: React.CSSProperties;
}

function PixiCardPreviewInner({
    imageBlob,
    params,
    darknessFactor,
    width,
    height,
    className,
    style,
}: PixiCardPreviewProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<Container | null>(null);
    const spriteRef = useRef<PixiSprite | null>(null);
    const darkenFilterRef = useRef<DarkenFilter | null>(null);
    const adjustFilterRef = useRef<AdjustmentFilter | null>(null);
    const textureRef = useRef<Texture | null>(null);
    const renderTextureRef = useRef<RenderTexture | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [textureVersion, setTextureVersion] = useState(0); // Increment to trigger render
    const blobUrlRef = useRef<string | null>(null);
    const prevDimensionsRef = useRef({ width: 0, height: 0 });

    // Initialize container, sprite and filters (once)
    useEffect(() => {
        const app = getPixiApp();
        if (!app) {
            console.warn('[PixiCardPreview] PixiJS app not available');
            return;
        }

        // Create offscreen container for this preview
        const container = new Container();
        container.label = 'card-preview-container';

        // Create sprite (initially with empty texture)
        const sprite = new PixiSprite();
        sprite.label = 'card-preview-sprite';

        // Create filters
        const darkenFilter = new DarkenFilter();
        const adjustFilter = new AdjustmentFilter();

        container.addChild(sprite);

        containerRef.current = container;
        spriteRef.current = sprite;
        darkenFilterRef.current = darkenFilter;
        adjustFilterRef.current = adjustFilter;

        setIsReady(true);

        return () => {
            // Cleanup
            if (textureRef.current) {
                textureRef.current.destroy();
                textureRef.current = null;
            }
            if (renderTextureRef.current) {
                renderTextureRef.current.destroy();
                renderTextureRef.current = null;
            }
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
            }
            container.destroy({ children: true });
            darkenFilter.destroy();
            adjustFilter.destroy();
            containerRef.current = null;
            spriteRef.current = null;
            darkenFilterRef.current = null;
            adjustFilterRef.current = null;
            setIsReady(false);
        };
    }, []); // Only run once on mount

    // Holographic animation state
    const holoAngleRef = useRef(params.holoAngle);
    const holoStrengthRef = useRef(params.holoStrength);
    const lastAnimationTimeRef = useRef(performance.now());
    const [holoAnimationTick, setHoloAnimationTick] = useState(0);



    // Holographic animation effect for auto-shimmer in editor
    useEffect(() => {
        if (!isReady || params.holoEffect === 'none' || params.holoAnimation === 'none') return;

        let intervalId: ReturnType<typeof setInterval> | null = null;

        const animate = () => {
            const now = performance.now();
            const delta = (now - lastAnimationTimeRef.current) / 1000;
            lastAnimationTimeRef.current = now;

            const result = calculateHoloAnimation(
                params.holoAnimation as HoloAnimationStyle,
                now,
                params.holoSpeed,
                params.holoStrength,
                holoAngleRef.current,
                delta
            );
            holoAngleRef.current = result.angle;
            holoStrengthRef.current = result.strength;

            setHoloAnimationTick(t => t + 1);
        };

        intervalId = setInterval(animate, 50);
        return () => { if (intervalId) clearInterval(intervalId); };
    }, [isReady, params.holoEffect, params.holoAnimation, params.holoSpeed, params.holoStrength]);



    // Create/update render texture when dimensions change
    useEffect(() => {
        if (!isReady) return;

        const app = getPixiApp();
        if (!app) return;

        // Only recreate if dimensions actually changed
        if (prevDimensionsRef.current.width === width && prevDimensionsRef.current.height === height) {
            return;
        }
        prevDimensionsRef.current = { width, height };

        // Destroy old render texture
        if (renderTextureRef.current) {
            renderTextureRef.current.destroy();
        }

        // Create new render texture with new dimensions
        const renderTexture = RenderTexture.create({
            width,
            height,
            resolution: 1,
        });
        renderTextureRef.current = renderTexture;

        // Update sprite sizing if texture is loaded
        if (textureRef.current && spriteRef.current) {
            const texture = textureRef.current;
            const sprite = spriteRef.current;
            const scale = Math.min(width / texture.width, height / texture.height);
            sprite.width = texture.width * scale;
            sprite.height = texture.height * scale;
            sprite.x = (width - sprite.width) / 2;
            sprite.y = (height - sprite.height) / 2;
        }
    }, [isReady, width, height]);

    // Load texture when blob changes
    useEffect(() => {
        if (!isReady || !imageBlob || !spriteRef.current) return;

        const sprite = spriteRef.current;

        // Clean up old texture and URL
        if (textureRef.current) {
            textureRef.current.destroy();
            textureRef.current = null;
        }
        if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
        }

        // Create new texture from blob
        const url = URL.createObjectURL(imageBlob);
        blobUrlRef.current = url;

        const img = new Image();
        img.onload = () => {
            if (!spriteRef.current) return;

            const texture = Texture.from(img);
            textureRef.current = texture;
            sprite.texture = texture;

            // Resize sprite to fit preview dimensions while maintaining aspect ratio
            const scale = Math.min(width / texture.width, height / texture.height);
            sprite.width = texture.width * scale;
            sprite.height = texture.height * scale;
            sprite.x = (width - sprite.width) / 2;
            sprite.y = (height - sprite.height) / 2;

            // Increment version to trigger render effect
            setTextureVersion(v => v + 1);
        };
        img.onerror = () => {
            console.error('[PixiCardPreview] Failed to load image');
        };
        img.src = url;
    }, [imageBlob, isReady, width, height]);

    // Update filters and render when params change
    useEffect(() => {
        if (!isReady) return;

        const app = getPixiApp();
        const container = containerRef.current;
        const sprite = spriteRef.current;
        const darkenFilter = darkenFilterRef.current;
        const adjustFilter = adjustFilterRef.current;
        const renderTexture = renderTextureRef.current;
        const canvas = canvasRef.current;

        // Check that texture is loaded (textureRef.current is set after image loads)
        if (!app || !container || !sprite || !darkenFilter || !adjustFilter || !renderTexture || !canvas || !textureRef.current) {
            return;
        }

        // Update filter uniforms
        const globalSettings = useSettingsStore.getState();

        // Calculate standardized layout dimensions at 96 DPI
        const standardTextureSize: [number, number] = [CONSTANTS.CARD_WIDTH_PX, CONSTANTS.CARD_HEIGHT_PX];

        // Resolve exact settings manually applied by the slider vs global parameters 
        const activeDarkenMode = params.darkenUseGlobalSettings ? globalSettings.darkenMode : params.darkenMode;
        const activeDarkenAutoDetect = params.darkenUseGlobalSettings ? globalSettings.darkenAutoDetect : params.darkenAutoDetect;

        // Build temporary overrides object merging slider states and toggled globals for the external utility
        const resolvedOverrides: RenderParams = { ...params };
        resolvedOverrides.darkenMode = activeDarkenMode;
        resolvedOverrides.darkenAutoDetect = activeDarkenAutoDetect;
        resolvedOverrides.darkenEdgeWidth = params.darkenUseGlobalSettings ? globalSettings.darkenEdgeWidth : params.darkenEdgeWidth;
        resolvedOverrides.darkenAmount = params.darkenUseGlobalSettings ? globalSettings.darkenAmount : params.darkenAmount;
        resolvedOverrides.darkenContrast = params.darkenUseGlobalSettings ? globalSettings.darkenContrast : params.darkenContrast;
        resolvedOverrides.darkenBrightness = params.darkenUseGlobalSettings ? globalSettings.darkenBrightness : params.darkenBrightness;

        // Apply Darken Filter
        applyDarkenFilter(
            darkenFilter,
            resolvedOverrides,
            globalSettings,
            darknessFactor,
            [sprite.width, sprite.height] // Darken filter relies on dynamic display size for proper edge feathering bounds
        );

        // Apply Adjustment Filter
        // Scale adjustment resolution to dynamically match the PDF worker's relative sizing geometry.
        const dpi = globalSettings.dpi ?? 300;
        const kernelScale = Math.max(1.0, dpi / CONSTANTS.SCREEN_DPI);
        adjustFilter.resolution = sprite.width > 0 ? (CONSTANTS.CARD_WIDTH_PX * kernelScale) / sprite.width : 1;

        applyAdjustmentFilter(
            adjustFilter,
            resolvedOverrides,
            standardTextureSize, // Physics layout forces the math coordinates independently of any responsive CSS zooms
            { angle: holoAngleRef.current, strength: holoStrengthRef.current }
        );

        // Build filter array
        const filters: import('pixi.js').Filter[] = [];

        if (activeDarkenMode && activeDarkenMode !== 'none') {
            filters.push(darkenFilter);
        }

        if (hasActiveAdjustments(resolvedOverrides as unknown as CardOverrides, false)) {
            filters.push(adjustFilter);
        }

        sprite.filters = filters.length > 0 ? filters : null;

        // Render to texture
        try {
            app.renderer.render({
                container,
                target: renderTexture,
            });

            // Extract pixels and draw to canvas
            const ctx = canvas.getContext('2d');
            if (ctx) {
                const pixels = app.renderer.extract.pixels(renderTexture);
                const imageData = new ImageData(
                    new Uint8ClampedArray(pixels.pixels),
                    renderTexture.width,
                    renderTexture.height
                );
                ctx.putImageData(imageData, 0, 0);
            }
        } catch (e) {
            console.warn('[PixiCardPreview] Render failed:', e);
        }
    }, [isReady, params, darknessFactor, width, height, textureVersion, holoAnimationTick]);

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className={className}
            style={{ display: 'block', ...style }}
        />
    );
}

export const PixiCardPreview = memo(PixiCardPreviewInner);
