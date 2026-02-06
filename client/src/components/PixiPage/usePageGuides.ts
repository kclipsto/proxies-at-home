/**
 * usePageGuides Hook
 * 
 * Manages page-level cut guide rendering for PixiJS virtual canvas.
 * Draws horizontal and vertical cut lines based on card positions.
 */

import { useRef, useEffect } from 'react';
import { Graphics, type Container, type Application } from 'pixi.js';
import type { CardWithGlobalLayout, PageLayoutInfo } from './PixiVirtualCanvas';

const MM_TO_PX = 96 / 25.4;

interface UsePageGuidesProps {
    isReady: boolean;
    container: Container | null;
    app: Application | null;
    pages: PageLayoutInfo[];
    cards: CardWithGlobalLayout[];
    cutLineStyle: 'none' | 'full' | 'edges';
    guideWidth: number;
}

/**
 * Hook to render page-level cut guides
 */
export function usePageGuides({
    isReady,
    container,
    app,
    pages,
    cards,
    cutLineStyle,
    guideWidth,
}: UsePageGuidesProps): void {
    const graphicsRef = useRef<Graphics | null>(null);

    useEffect(() => {
        if (!isReady || !container) return;
        if (cutLineStyle === 'none' || guideWidth <= 0 || cards.length === 0) {
            if (graphicsRef.current) {
                graphicsRef.current.clear();
            }
            if (app) app.render();
            return;
        }

        let g = graphicsRef.current;
        if (!g) {
            g = new Graphics();
            container.addChild(g);
            graphicsRef.current = g;
        }

        g.clear();

        const guideWidthPx = Math.max(0.1, guideWidth);

        // Process cards page by page
        pages.forEach((page) => {
            const pageY = page.pageYOffset;
            const pageCards = cards.filter(c =>
                c.globalY >= pageY && c.globalY < pageY + page.pageHeightPx
            );

            if (pageCards.length === 0) return;

            // Build maps to track cut positions with direction for this page
            const xCutsMap = new Map<number, 'left' | 'right' | 'both'>();
            const yCutsMap = new Map<number, 'top' | 'bottom' | 'both'>();

            // Track grid start/end for edge-only mode
            let gridStartXPx = Infinity, gridEndXPx = 0;
            let gridStartYPx = Infinity, gridEndYPx = 0;

            // Process each card to compute cut positions
            pageCards.forEach((card) => {
                const bleedPx = card.bleedMm * MM_TO_PX;
                const baseWidthPx = card.baseCardWidthMm * MM_TO_PX;
                const baseHeightPx = card.baseCardHeightMm * MM_TO_PX;

                const leftCut = card.globalX + bleedPx;
                const rightCut = card.globalX + bleedPx + baseWidthPx;
                const topCut = card.globalY + bleedPx;
                const bottomCut = card.globalY + bleedPx + baseHeightPx;

                // Track grid bounds
                gridStartXPx = Math.min(gridStartXPx, leftCut);
                gridEndXPx = Math.max(gridEndXPx, rightCut);
                gridStartYPx = Math.min(gridStartYPx, topCut);
                gridEndYPx = Math.max(gridEndYPx, bottomCut);

                // Add vertical cuts
                xCutsMap.set(leftCut, xCutsMap.get(leftCut) === 'right' ? 'both' : 'left');
                xCutsMap.set(rightCut, xCutsMap.get(rightCut) === 'left' ? 'both' : 'right');

                // Add horizontal cuts
                yCutsMap.set(topCut, yCutsMap.get(topCut) === 'bottom' ? 'both' : 'top');
                yCutsMap.set(bottomCut, yCutsMap.get(bottomCut) === 'top' ? 'both' : 'bottom');
            });

            // Draw vertical cut lines
            xCutsMap.forEach((type, x) => {
                const drawLine = (offsetPx: number) => {
                    const lineX = x + offsetPx;
                    if (cutLineStyle === 'full') {
                        g.moveTo(lineX, pageY);
                        g.lineTo(lineX, pageY + page.pageHeightPx);
                    } else {
                        if (gridStartYPx > pageY) {
                            g.moveTo(lineX, pageY);
                            g.lineTo(lineX, gridStartYPx);
                        }
                        if (gridEndYPx < pageY + page.pageHeightPx) {
                            g.moveTo(lineX, gridEndYPx);
                            g.lineTo(lineX, pageY + page.pageHeightPx);
                        }
                    }
                };

                if (type === 'left' || type === 'both') drawLine(-guideWidthPx);
                if (type === 'right' || type === 'both') drawLine(0);
            });

            // Draw horizontal cut lines
            yCutsMap.forEach((type, y) => {
                const drawLine = (offsetPx: number) => {
                    const lineY = y + offsetPx;
                    if (cutLineStyle === 'full') {
                        g.moveTo(0, lineY);
                        g.lineTo(page.pageWidthPx, lineY);
                    } else {
                        if (gridStartXPx > 0) {
                            g.moveTo(0, lineY);
                            g.lineTo(gridStartXPx, lineY);
                        }
                        if (gridEndXPx < page.pageWidthPx) {
                            g.moveTo(gridEndXPx, lineY);
                            g.lineTo(page.pageWidthPx, lineY);
                        }
                    }
                };

                if (type === 'top' || type === 'both') drawLine(-guideWidthPx);
                if (type === 'bottom' || type === 'both') drawLine(0);
            });
        });

        // Stroke all the lines
        g.stroke({ color: 0x000000, width: guideWidthPx });

        if (app) {
            app.render();
        }
    }, [isReady, container, app, pages, cards, cutLineStyle, guideWidth]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (graphicsRef.current) {
                try { graphicsRef.current.destroy(); } catch { /* ignore */ }
                graphicsRef.current = null;
            }
        };
    }, []);
}
