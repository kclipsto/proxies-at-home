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
import type { RenderParams } from '../CardCanvas/types';

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
        // When using global defaults, use global settings; otherwise use params
        const globalSettings = useSettingsStore.getState();
        const darkenMode = params.darkenUseGlobalSettings ? globalSettings.darkenMode : params.darkenMode;
        const darkenAutoDetect = params.darkenUseGlobalSettings ? globalSettings.darkenAutoDetect : params.darkenAutoDetect;
        const darkenEdgeWidth = params.darkenUseGlobalSettings ? globalSettings.darkenEdgeWidth : params.darkenEdgeWidth;
        const darkenAmount = params.darkenUseGlobalSettings ? globalSettings.darkenAmount : params.darkenAmount;

        // When Auto Detect is enabled, use darknessFactor to compute contrast/brightness
        // When disabled, use manual slider values
        let darkenContrast: number;
        let darkenBrightness: number;

        if (darkenAutoDetect && (darkenMode === 'contrast-edges' || darkenMode === 'contrast-full')) {
            // Auto-detect mode: scale base values by darknessFactor
            darkenContrast = 2.0; // Base contrast
            darkenBrightness = -50; // Base brightness
        } else {
            // Manual mode: use slider values
            darkenContrast = params.darkenUseGlobalSettings ? globalSettings.darkenContrast : params.darkenContrast;
            darkenBrightness = params.darkenUseGlobalSettings ? globalSettings.darkenBrightness : params.darkenBrightness;
        }

        darkenFilter.darkenMode = darkenMode;
        darkenFilter.darknessFactor = darknessFactor;
        darkenFilter.darkenThreshold = params.darkenThreshold;
        darkenFilter.darkenContrast = darkenContrast;
        darkenFilter.darkenEdgeWidth = darkenEdgeWidth;
        darkenFilter.darkenAmount = darkenAmount;
        darkenFilter.darkenBrightness = darkenBrightness;
        darkenFilter.textureResolution = [sprite.width, sprite.height];

        adjustFilter.textureResolution = [sprite.width, sprite.height];
        adjustFilter.brightness = params.brightness;
        adjustFilter.contrast = params.contrast;
        adjustFilter.saturation = params.saturation;
        adjustFilter.sharpness = params.sharpness;
        adjustFilter.pop = params.pop;
        adjustFilter.hueShift = params.hueShift;
        adjustFilter.sepia = params.sepia;
        adjustFilter.tintColor = params.tintColor;
        adjustFilter.tintAmount = params.tintAmount;
        adjustFilter.redBalance = params.redBalance;
        adjustFilter.greenBalance = params.greenBalance;
        adjustFilter.blueBalance = params.blueBalance;
        adjustFilter.vignetteAmount = params.vignetteAmount;
        adjustFilter.vignetteSize = params.vignetteSize;
        adjustFilter.vignetteFeather = params.vignetteFeather;
        // CMYK balance
        adjustFilter.cyanBalance = params.cyanBalance;
        adjustFilter.magentaBalance = params.magentaBalance;
        adjustFilter.yellowBalance = params.yellowBalance;
        adjustFilter.blackBalance = params.blackBalance;
        // Color Balance (Shadows/Midtones/Highlights)
        adjustFilter.shadowsIntensity = params.shadowsIntensity;
        adjustFilter.midtonesIntensity = params.midtonesIntensity;
        adjustFilter.highlightsIntensity = params.highlightsIntensity;
        // Noise Reduction
        adjustFilter.noiseReduction = params.noiseReduction;
        // Preview Modes
        adjustFilter.cmykPreview = params.cmykPreview;
        // Holographic Effect
        adjustFilter.holoEffect = params.holoEffect;
        adjustFilter.holoStrength = holoStrengthRef.current;
        adjustFilter.holoAreaMode = params.holoAreaMode;
        adjustFilter.holoAngle = holoAngleRef.current;
        adjustFilter.holoSweepWidth = params.holoSweepWidth;
        adjustFilter.holoStarSize = params.holoStarSize;
        adjustFilter.holoStarVariety = params.holoStarVariety;
        adjustFilter.holoBlur = params.holoBlur;
        adjustFilter.holoProbability = params.holoProbability;
        adjustFilter.holoAreaThreshold = params.holoAreaThreshold;
        // Color Replace
        adjustFilter.colorReplaceEnabled = params.colorReplaceEnabled;
        adjustFilter.colorReplaceSource = params.colorReplaceSource;
        adjustFilter.colorReplaceTarget = params.colorReplaceTarget;
        adjustFilter.colorReplaceThreshold = params.colorReplaceThreshold;
        // Gamma
        adjustFilter.gamma = params.gamma;

        // Build filter array
        const filters: import('pixi.js').Filter[] = [];

        if (params.darkenMode !== 'none') {
            filters.push(darkenFilter);
        }

        const hasAdjustments =
            params.brightness !== 0 ||
            params.contrast !== 1 ||
            params.saturation !== 1 ||
            params.sharpness !== 0 ||
            params.pop !== 0 ||
            params.hueShift !== 0 ||
            params.sepia !== 0 ||
            params.tintAmount !== 0 ||
            params.redBalance !== 0 ||
            params.greenBalance !== 0 ||
            params.blueBalance !== 0 ||
            params.cyanBalance !== 0 ||
            params.magentaBalance !== 0 ||
            params.yellowBalance !== 0 ||
            params.blackBalance !== 0 ||
            params.shadowsIntensity !== 0 ||
            params.midtonesIntensity !== 0 ||
            params.highlightsIntensity !== 0 ||
            params.noiseReduction !== 0 ||
            params.cmykPreview ||
            params.holoEffect !== 'none' ||
            params.colorReplaceEnabled ||
            params.gamma !== 1.0 ||
            params.vignetteAmount !== 0;

        if (hasAdjustments) {
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
