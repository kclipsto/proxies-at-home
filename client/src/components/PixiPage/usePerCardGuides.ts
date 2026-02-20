/**
 * usePerCardGuides Hook
 * 
 * Manages per-card cut guide rendering for PixiJS virtual canvas.
 * Uses cached GraphicsContext for cards with same dimensions.
 */

import { useRef, useEffect } from 'react';
import { Graphics, GraphicsContext, type Container, type Application } from 'pixi.js';
import { generatePerCardGuide, executePathCommands, groupPathCommandsIntoSegments } from '../../helpers/cutGuideUtils';
import type { CardWithGlobalLayout } from './PixiVirtualCanvas';
import { CONSTANTS } from "@/constants/commonConstants";

type PerCardGuideStyle = 'corners' | 'rounded-corners' | 'dashed-corners' | 'dashed-rounded-corners' | 'solid-squared-rect' | 'dashed-squared-rect' | 'dashed-rounded-rect' | 'solid-rounded-rect' | 'none';
type GuidePlacement = 'inside' | 'outside' | 'center';

interface UsePerCardGuidesProps {
    isReady: boolean;
    container: Container | null;
    app: Application | null;
    cards: CardWithGlobalLayout[];
    guideStyle: PerCardGuideStyle;
    guideColor: number;
    guidePlacement: GuidePlacement;
    guideWidth: number;
    cutGuideLengthMm: number;
    activeId?: string | null;
}

/**
 * Hook to render per-card cut guides with dimension-based context caching
 */
export function usePerCardGuides({
    isReady,
    container,
    app,
    cards,
    guideStyle,
    guideColor,
    guidePlacement,
    guideWidth,
    cutGuideLengthMm,
    activeId,
}: UsePerCardGuidesProps): void {
    const graphicsRef = useRef<Map<string, Graphics>>(new Map());

    // Render per-card guides
    useEffect(() => {
        if (!isReady || !container) return;

        const graphics = graphicsRef.current;

        // Clear existing graphics
        graphics.forEach((g) => {
            try {
                container.removeChild(g);
                g.destroy();
            } catch { /* ignore */ }
        });
        graphics.clear();

        if (guideStyle === 'none' || guideWidth <= 0 || cards.length === 0) {
            if (app) app.render();
            return;
        }

        const guideWidthPx = Math.max(0.1, guideWidth);
        const radiusPx = CONSTANTS.CORNER_RADIUS_MM * CONSTANTS.DISPLAY_MM_TO_PX;
        const isRounded = guideStyle.includes('rounded');
        const isRect = guideStyle.includes('rect');

        // Offset for placement
        const halfStroke = guideWidthPx / 2;
        const offset = guidePlacement === 'outside' ? -halfStroke : guidePlacement === 'inside' ? halfStroke : 0;

        // Cache of GraphicsContext by dimension key
        const contextCache = new Map<string, GraphicsContext>();

        // Build context for given dimensions
        const getOrCreateContext = (baseWidthPx: number, baseHeightPx: number): GraphicsContext => {
            const key = `${baseWidthPx.toFixed(1)}-${baseHeightPx.toFixed(1)}`;

            let ctx = contextCache.get(key);
            if (ctx) return ctx;

            ctx = new GraphicsContext();

            // Use configurable guide length (in mm, converted to px)
            const targetLegExtendPx = cutGuideLengthMm * CONSTANTS.DISPLAY_MM_TO_PX;

            // Generate commands using shared utility
            const commands = generatePerCardGuide(
                baseWidthPx,
                baseHeightPx,
                radiusPx,
                guideWidthPx,
                guideStyle,
                guidePlacement,
                targetLegExtendPx
            );

            if (commands.length > 0) {
                // Use segment-based rendering to work around Android WebGL artifacts
                // where implicit lines are drawn between moveTo calls after arcs.
                // Each segment is stroked separately to prevent these artifacts.
                const segments = groupPathCommandsIntoSegments(commands);
                for (const segment of segments) {
                    executePathCommands(ctx, segment);
                    ctx.stroke({ color: guideColor, width: guideWidthPx });
                }
            } else if (isRect) {
                // Fallback for solid rects
                const r = isRounded ? radiusPx : 0;
                const x = offset;
                const y = offset;
                const w = baseWidthPx - 2 * offset;
                const h = baseHeightPx - 2 * offset;

                if (r > 0) {
                    ctx.roundRect(x, y, w, h, r);
                } else {
                    ctx.rect(x, y, w, h);
                }
                ctx.stroke({ color: guideColor, width: guideWidthPx });
            }
            contextCache.set(key, ctx);
            return ctx;
        };

        // Create Graphics for each card using shared contexts
        cards.forEach((card, idx) => {
            // Skip the actively dragged card
            if (activeId && card.card.uuid === activeId) return;

            const bleedPx = card.bleedMm * CONSTANTS.DISPLAY_MM_TO_PX;

            const ctx = getOrCreateContext(CONSTANTS.CARD_WIDTH_PX, CONSTANTS.CARD_HEIGHT_PX);
            const g = new Graphics(ctx);
            g.x = card.globalX + bleedPx;
            g.y = card.globalY + bleedPx;

            container.addChild(g);
            graphics.set(`${card.card.uuid}-${idx}`, g);
        });

        if (app) app.render();
    }, [isReady, container, app, cards, guideStyle, guideColor, guidePlacement, guideWidth, cutGuideLengthMm, activeId]);

    // Cleanup on unmount
    useEffect(() => {
        const graphics = graphicsRef.current;
        return () => {
            graphics.forEach((g) => {
                try { g?.destroy(); } catch { /* ignore */ }
            });
            graphics.clear();
        };
    }, []);
}
