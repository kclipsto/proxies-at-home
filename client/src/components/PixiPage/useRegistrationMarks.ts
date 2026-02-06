/**
 * useRegistrationMarks Hook
 *
 * Renders Silhouette registration marks on the page preview.
 * Supports 3-point (square + 2 L-shapes) and 4-point (4 L-shapes) modes.
 * Portrait mode rotates mark positions for paper loaded in portrait orientation.
 */

import { useRef, useEffect } from 'react';
import { Graphics, type Container, type Application } from 'pixi.js';
import type { PageLayoutInfo } from './PixiVirtualCanvas';

const MM_TO_PX = 96 / 25.4;

// Registration mark constants (must match pdf.worker.ts)
const REG_MARK_OFFSET_MM = 10.0076;  // 0.394" from page edge (Silhouette spec)
const REG_MARK_SQUARE_SIZE_MM = 5;  // Size of the top-left square (3-point)
const REG_MARK_ARM_LENGTH_MM = 8.382;   // 0.33" length of L-shape arms (Silhouette spec)
const REG_MARK_LINE_WIDTH_MM = 0.9906; // 0.039" thickness of L-shape lines

interface UseRegistrationMarksProps {
    isReady: boolean;
    container: Container | null;
    app: Application | null;
    pages: PageLayoutInfo[];
    registrationMarks: 'none' | '3' | '4';
    registrationMarksPortrait: boolean;
}

/**
 * Draw an L-shape mark at the given position using filled rectangles
 * Simulates "square" line cap by extending geometry by half thickness
 */
function drawLShape(
    g: Graphics,
    x: number,
    y: number,
    armLength: number,
    thickness: number,
    verticalDir: 'up' | 'down',
    horizontalDir: 'left' | 'right'
): void {
    const w = thickness;
    const L = armLength;

    const vx = x - w / 2;
    const vy = verticalDir === 'down' ? y - w / 2 : y - L - w / 2;
    g.rect(vx, vy, w, L + w);

    const hx = horizontalDir === 'right' ? x - w / 2 : x - L - w / 2;
    const hy = y - w / 2;
    g.rect(hx, hy, L + w, w);
}

/**
 * Hook to render registration marks on each page
 */
export function useRegistrationMarks({
    isReady,
    container,
    app,
    pages,
    registrationMarks,
    registrationMarksPortrait,
}: UseRegistrationMarksProps): void {
    const graphicsRef = useRef<Graphics | null>(null);

    useEffect(() => {
        if (!isReady || !container) return;

        // Always destroy old graphics to ensure clean state
        if (graphicsRef.current) {
            try {
                graphicsRef.current.parent?.removeChild(graphicsRef.current);
                graphicsRef.current.destroy();
            } catch { /* ignore */ }
            graphicsRef.current = null;
        }

        if (registrationMarks === 'none') {
            if (app) app.render();
            return;
        }

        // Create fresh graphics object
        const g = new Graphics();
        container.addChild(g);
        graphicsRef.current = g;

        const offsetPx = REG_MARK_OFFSET_MM * MM_TO_PX;
        const squareSizePx = REG_MARK_SQUARE_SIZE_MM * MM_TO_PX;
        const armLengthPx = REG_MARK_ARM_LENGTH_MM * MM_TO_PX;
        const lineWidthPx = REG_MARK_LINE_WIDTH_MM * MM_TO_PX;

        pages.forEach((page) => {
            const pageY = page.pageYOffset;
            const pageW = page.pageWidthPx;
            const pageH = page.pageHeightPx;

            // Position coordinates
            const topLeftX = offsetPx;
            const topLeftY = pageY + offsetPx;
            const topRightX = pageW - offsetPx;
            const topRightY = pageY + offsetPx;
            const bottomLeftX = offsetPx;
            const bottomLeftY = pageY + pageH - offsetPx;
            const bottomRightX = pageW - offsetPx;
            const bottomRightY = pageY + pageH - offsetPx;

            if (registrationMarksPortrait) {
                // Portrait mode: marks rotated for paper loaded in portrait orientation
                // Square (3-point) at bottom-left, L's at top-left, bottom-right, (and top-right for 4-point)
                if (registrationMarks === '3') {
                    // 3-point: solid black square at bottom-left
                    g.rect(bottomLeftX, bottomLeftY - squareSizePx, squareSizePx, squareSizePx);
                } else {
                    // 4-point: L-shape at bottom-left (up + right)
                    drawLShape(g, bottomLeftX, bottomLeftY, armLengthPx, lineWidthPx, 'up', 'right');
                }

                // Top-left: L-shape (down + right)
                drawLShape(g, topLeftX, topLeftY, armLengthPx, lineWidthPx, 'down', 'right');

                // Bottom-right: L-shape (up + left)
                drawLShape(g, bottomRightX, bottomRightY, armLengthPx, lineWidthPx, 'up', 'left');

                // Top-right: L-shape (only for 4-point, down + left)
                if (registrationMarks === '4') {
                    drawLShape(g, topRightX, topRightY, armLengthPx, lineWidthPx, 'down', 'left');
                }
            } else {
                // Landscape mode: standard mark positions
                // Square (3-point) at top-left, L's at top-right, bottom-left, (and bottom-right for 4-point)
                if (registrationMarks === '3') {
                    // 3-point: solid black square at top-left
                    g.rect(topLeftX, topLeftY, squareSizePx, squareSizePx);
                } else {
                    // 4-point: L-shape at top-left (down + right)
                    drawLShape(g, topLeftX, topLeftY, armLengthPx, lineWidthPx, 'down', 'right');
                }

                // Top-right: L-shape (down + left)
                drawLShape(g, topRightX, topRightY, armLengthPx, lineWidthPx, 'down', 'left');

                // Bottom-left: L-shape (up + right)
                drawLShape(g, bottomLeftX, bottomLeftY, armLengthPx, lineWidthPx, 'up', 'right');

                // Bottom-right: L-shape (only for 4-point, up + left)
                if (registrationMarks === '4') {
                    drawLShape(g, bottomRightX, bottomRightY, armLengthPx, lineWidthPx, 'up', 'left');
                }
            }
        });

        // Fill all shapes at once (black)
        g.fill({ color: 0x000000 });

        if (app) {
            app.render();
        }
    }, [isReady, container, app, pages, registrationMarks, registrationMarksPortrait]);

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
