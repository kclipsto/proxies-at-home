import { CONSTANTS } from "@/constants/commonConstants";
import React, { memo } from "react";

// Corner radius for MTG cards per wiki: 2.5mm
const CARD_CORNER_RADIUS_MM = 2.5;

type Props = {
    guideWidth: number;
    guideColor: string;
    perCardGuideStyle: string;
    guidePlacement: string;
    guideOffset: number | string;
    imageBleedWidth?: number;
};

export const CardGuides = memo(function CardGuides({
    guideWidth,
    guideColor,
    perCardGuideStyle,
    guidePlacement,
    guideOffset,
    imageBleedWidth
}: Props) {
    if (perCardGuideStyle === 'none') return null;

    return (
        <div className="pointer-events-none z-10 absolute inset-0">
            {(perCardGuideStyle === 'corners' || perCardGuideStyle === 'dashed-corners') ? (
                /* Corner marks - L-shaped tick marks at each corner */
                (() => {
                    if (guideWidth <= 0) return null;

                    // Guide width is in CSS pixels (96 DPI)
                    const guideWidthPx = Math.max(1, Math.round(guideWidth));
                    // For outside: offset by full width to place guide entirely outside the cut line
                    // For inside: just use the offset as-is (guide grows inward)
                    const offsetCalc = guidePlacement === 'outside'
                        ? (val: number | string) => `calc(${typeof val === 'number' ? `${val}px` : val} - ${guideWidthPx}px)`
                        : (val: number | string) => typeof val === 'number' ? `${val}px` : val;

                    // Length of one leg = 2.5 * radius. Radius = 2.5mm, so Leg = 6.25mm
                    const legLengthMm = 6.25;
                    const length = guidePlacement === 'outside'
                        ? `calc(${legLengthMm}mm + ${guideWidthPx}px)`
                        : `${legLengthMm}mm`;

                    const isDashed = perCardGuideStyle === 'dashed-corners';

                    // For dashed corners, use repeating linear gradient to simulate dashed lines
                    const getBackgroundStyle = (direction: string): React.CSSProperties => {
                        if (isDashed) {
                            // We want exactly 2.5 dashes along the leg length (6.25mm)
                            // Total path (2 legs) has 5 dashes + 4 gaps.
                            // Total Length = 12.5mm.
                            // Dash d, Gap g=0.6d. Total = 7.4d.
                            // d = 12.5 / 7.4 approx 1.69mm.
                            const totalL = 12.5;
                            const d = totalL / 7.4; // mm
                            const g = d * 0.6; // mm

                            // Convert to px
                            const dPx = (d * CONSTANTS.DISPLAY_MM_TO_PX);
                            const gPx = (g * CONSTANTS.DISPLAY_MM_TO_PX);

                            // Pattern starts from the CORNER (0px)
                            // 1. 0 -> d/2 (Half dash at corner)
                            // 2. Gap g
                            // 3. Dash d
                            // 4. Gap g
                            // 5. Dash d
                            return {
                                background: `repeating-linear-gradient(${direction}, ${guideColor} 0px, ${guideColor} ${dPx / 2}px, transparent ${dPx / 2}px, transparent ${dPx / 2 + gPx}px, ${guideColor} ${dPx / 2 + gPx}px, ${guideColor} ${dPx / 2 + gPx + dPx}px, transparent ${dPx / 2 + gPx + dPx}px, transparent ${dPx / 2 + gPx + dPx + gPx}px, ${guideColor} ${dPx / 2 + gPx + dPx + gPx}px, ${guideColor} ${dPx / 2 + gPx + dPx + gPx + dPx}px)`,
                            };
                        }
                        return { backgroundColor: guideColor };
                    };

                    return (
                        <>
                            {/* Top Left */}
                            <div
                                data-testid="guide-top-left-h"
                                style={{
                                    position: "absolute",
                                    top: offsetCalc(guideOffset),
                                    left: offsetCalc(guideOffset),
                                    width: length,
                                    height: `${guideWidthPx}px`,
                                    ...getBackgroundStyle('to right'),
                                }}
                            />
                            <div
                                data-testid="guide-top-left-v"
                                style={{
                                    position: "absolute",
                                    top: offsetCalc(guideOffset),
                                    left: offsetCalc(guideOffset),
                                    width: `${guideWidthPx}px`,
                                    height: length,
                                    ...getBackgroundStyle('to bottom'),
                                }}
                            />

                            {/* Top Right */}
                            <div
                                data-testid="guide-top-right-h"
                                style={{
                                    position: "absolute",
                                    top: offsetCalc(guideOffset),
                                    right: offsetCalc(guideOffset),
                                    width: length,
                                    height: `${guideWidthPx}px`,
                                    ...getBackgroundStyle('to left'),
                                }}
                            />
                            <div
                                data-testid="guide-top-right-v"
                                style={{
                                    position: "absolute",
                                    top: offsetCalc(guideOffset),
                                    right: offsetCalc(guideOffset),
                                    width: `${guideWidthPx}px`,
                                    height: length,
                                    ...getBackgroundStyle('to bottom'),
                                }}
                            />

                            {/* Bottom Left */}
                            <div
                                data-testid="guide-bottom-left-h"
                                style={{
                                    position: "absolute",
                                    bottom: offsetCalc(guideOffset),
                                    left: offsetCalc(guideOffset),
                                    width: length,
                                    height: `${guideWidthPx}px`,
                                    ...getBackgroundStyle('to right'),
                                }}
                            />
                            <div
                                data-testid="guide-bottom-left-v"
                                style={{
                                    position: "absolute",
                                    bottom: offsetCalc(guideOffset),
                                    left: offsetCalc(guideOffset),
                                    width: `${guideWidthPx}px`,
                                    height: length,
                                    ...getBackgroundStyle('to top'),
                                }}
                            />

                            {/* Bottom Right */}
                            <div
                                data-testid="guide-bottom-right-h"
                                style={{
                                    position: "absolute",
                                    bottom: offsetCalc(guideOffset),
                                    right: offsetCalc(guideOffset),
                                    width: length,
                                    height: `${guideWidthPx}px`,
                                    ...getBackgroundStyle('to left'),
                                }}
                            />
                            <div
                                data-testid="guide-bottom-right-v"
                                style={{
                                    position: "absolute",
                                    bottom: offsetCalc(guideOffset),
                                    right: offsetCalc(guideOffset),
                                    width: `${guideWidthPx}px`,
                                    height: length,
                                    ...getBackgroundStyle('to top'),
                                }}
                            />
                        </>
                    );
                })()
            ) : (perCardGuideStyle === 'rounded-corners' || perCardGuideStyle === 'dashed-rounded-corners') ? (
                /* Rounded corner marks using 4 CSS quarter-circle borders */
                (() => {
                    if (guideWidth <= 0) return null;

                    // Guide width is in CSS pixels (96 DPI)
                    const guideWidthPx = Math.max(1, Math.round(guideWidth));


                    // Parse guideOffset to pixels, or use imageBleedWidth if available (for per-card custom bleed)
                    let offsetPx = 0;
                    if (imageBleedWidth !== undefined) {
                        // Per-card bleed width takes precedence
                        offsetPx = CONSTANTS.DISPLAY_MM_TO_PX * imageBleedWidth;
                    } else if (typeof guideOffset === 'number') {
                        offsetPx = guideOffset;
                    } else if (typeof guideOffset === 'string' && guideOffset.endsWith('mm')) {
                        offsetPx = CONSTANTS.DISPLAY_MM_TO_PX * parseFloat(guideOffset);
                    }

                    // Round offset to nearest pixel to avoid sub-pixel rendering
                    const roundedOffsetPx = Math.round(offsetPx);

                    // Calculate position: for outside, offset - guideWidth; for inside, just offset
                    const pos = guidePlacement === 'outside'
                        ? roundedOffsetPx - guideWidthPx
                        : roundedOffsetPx;

                    // Calculate dimensions
                    const radiusPx = Math.round(CONSTANTS.DISPLAY_MM_TO_PX * CARD_CORNER_RADIUS_MM);
                    // For outside: SVG box needs to be larger to accommodate the outward stroke
                    // For inside: inner edge at card radius, so outer edge at radius + guideWidth
                    const W = radiusPx + guideWidthPx;

                    const w = guideWidthPx;
                    // Arc radius: stroke is centered on the path
                    // For outside: inner edge at card radius, path at radius + w/2, outer at radius + w
                    // For inside: inner edge at card radius, path at radius + w/2, outer at radius + w
                    // Both cases have the same arc radius!
                    const Rc = radiusPx + w / 2;

                    // SVG Path for Top-Left corner (stroked arc)
                    // Center of arc is at (W, W)
                    // Start at (w/2, W) -> (W - Rc, W)
                    // End at (W, w/2) -> (W, W - Rc)
                    // Arc from start to end
                    const start = w / 2;
                    const pathData = `M ${start} ${W} A ${Rc} ${Rc} 0 0 1 ${W} ${start}`;

                    const commonStyle: React.CSSProperties = {
                        position: 'absolute',
                        width: `${W}px`,
                        height: `${W}px`,
                        pointerEvents: 'none',
                    };

                    const isDashedCorner = perCardGuideStyle === 'dashed-rounded-corners';
                    const strokeDash = isDashedCorner ? `${Math.max(3, w)}` : undefined;

                    return (
                        <>
                            {/* Top Left */}
                            <svg style={{ ...commonStyle, top: `${pos}px`, left: `${pos}px` }}>
                                <path d={pathData} fill="none" stroke={guideColor} strokeWidth={w} strokeLinecap="butt" strokeDasharray={strokeDash} />
                            </svg>

                            {/* Top Right - Rotate 90deg */}
                            <svg style={{ ...commonStyle, top: `${pos}px`, right: `${pos}px`, transform: 'rotate(90deg)' }}>
                                <path d={pathData} fill="none" stroke={guideColor} strokeWidth={w} strokeLinecap="butt" strokeDasharray={strokeDash} />
                            </svg>

                            {/* Bottom Right - Rotate 180deg */}
                            <svg style={{ ...commonStyle, bottom: `${pos}px`, right: `${pos}px`, transform: 'rotate(180deg)' }}>
                                <path d={pathData} fill="none" stroke={guideColor} strokeWidth={w} strokeLinecap="butt" strokeDasharray={strokeDash} />
                            </svg>

                            {/* Bottom Left - Rotate 270deg */}
                            <svg style={{ ...commonStyle, bottom: `${pos}px`, left: `${pos}px`, transform: 'rotate(270deg)' }}>
                                <path d={pathData} fill="none" stroke={guideColor} strokeWidth={w} strokeLinecap="butt" strokeDasharray={strokeDash} />
                            </svg>
                        </>
                    );
                })()
            ) : (
                /* Solid or dashed rounded/square rectangle using CSS border-radius
                   Guide width is in pixels */
                (() => {
                    if (guideWidth <= 0) return null;

                    // Guide width is in CSS pixels (96 DPI)
                    const guideWidthPx = Math.max(1, Math.round(guideWidth));

                    const isSquare = perCardGuideStyle === 'solid-squared-rect' || perCardGuideStyle === 'dashed-squared-rect';
                    const isDashed = perCardGuideStyle === 'dashed-rounded-rect' || perCardGuideStyle === 'dashed-squared-rect';

                    // Parse guideOffset to get offset value, or use imageBleedWidth if available (for per-card custom bleed)
                    let offsetMm: number;
                    if (imageBleedWidth !== undefined) {
                        // Per-card bleed width takes precedence
                        offsetMm = imageBleedWidth;
                    } else if (typeof guideOffset === 'string' && guideOffset.endsWith('mm')) {
                        offsetMm = parseFloat(guideOffset);
                    } else if (typeof guideOffset === 'number') {
                        // Convert pixels back to mm (assuming 96 DPI)
                        offsetMm = (guideOffset * CONSTANTS.DISPLAY_MM_TO_PX);
                    } else {
                        offsetMm = 0;
                    }

                    const offsetValue = `${offsetMm}mm`;
                    const positionOffset = guidePlacement === 'outside'
                        ? `calc(${offsetValue} - ${guideWidthPx}px)`
                        : offsetValue;

                    // For outside: outer radius = card radius + width (inner edge at card radius)
                    // For inside: inner radius should be 2.5mm, so border-radius = 2.5mm + width
                    //             (CSS border-radius is the outer edge, inner edge = outer - border-width)
                    const borderRadius = isSquare
                        ? 0
                        : guidePlacement === 'outside'
                            ? `calc(${CARD_CORNER_RADIUS_MM}mm + ${guideWidthPx}px)`
                            : `calc(${CARD_CORNER_RADIUS_MM}mm + ${guideWidthPx}px)`;

                    return (
                        <div
                            className="absolute"
                            style={{
                                top: positionOffset,
                                left: positionOffset,
                                right: positionOffset,
                                bottom: positionOffset,
                                borderRadius,
                                border: `${guideWidthPx}px ${isDashed ? 'dashed' : 'solid'} ${guideColor}`,
                                boxSizing: 'border-box',
                            }}
                        />
                    );
                })()
            )}
        </div>
    );
});
