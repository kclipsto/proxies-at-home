/**
 * Shared cut guide drawing utilities
 * Used by both PixiJS canvas and PDF export for consistent guide rendering
 */

// Guide style types
export type GuideStyle =
    | 'corners'
    | 'rounded-corners'
    | 'dashed-corners'
    | 'dashed-rounded-corners'
    | 'solid-rounded-rect'
    | 'dashed-rounded-rect'
    | 'solid-squared-rect'
    | 'dashed-squared-rect'
    | 'none';

// Path segment types
type PathCommand =
    | { type: 'moveTo'; x: number; y: number }
    | { type: 'lineTo'; x: number; y: number }
    | { type: 'arc'; cx: number; cy: number; r: number; startAngle: number; endAngle: number };



// Interface for drawing context (works with both Canvas2D and PixiJS GraphicsContext)
export interface DrawingContext {
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    arc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): void;
}

/**
 * Execute path commands on a drawing context
 * Note: Arc commands are converted to line segments to work around Android WebGL
 * rendering artifacts where the native arc() can cause unexpected lines.
 */
export function executePathCommands(ctx: DrawingContext, commands: PathCommand[]): void {
    for (const cmd of commands) {
        switch (cmd.type) {
            case 'moveTo':
                ctx.moveTo(cmd.x, cmd.y);
                break;
            case 'lineTo':
                ctx.lineTo(cmd.x, cmd.y);
                break;
            case 'arc': {
                // Convert arc to line segments to avoid Android WebGL issues
                // Calculate the number of segments based on arc length
                const arcLength = Math.abs(cmd.endAngle - cmd.startAngle) * cmd.r;
                // Use ~2px per segment for smooth curves
                const numSegments = Math.max(8, Math.ceil(arcLength / 2));
                const angleStep = (cmd.endAngle - cmd.startAngle) / numSegments;

                // Move to arc start
                const startX = cmd.cx + Math.cos(cmd.startAngle) * cmd.r;
                const startY = cmd.cy + Math.sin(cmd.startAngle) * cmd.r;
                ctx.moveTo(startX, startY);

                // Draw line segments along the arc
                for (let i = 1; i <= numSegments; i++) {
                    const angle = cmd.startAngle + angleStep * i;
                    const x = cmd.cx + Math.cos(angle) * cmd.r;
                    const y = cmd.cy + Math.sin(angle) * cmd.r;
                    ctx.lineTo(x, y);
                }
                break;
            }
        }
    }
}

/**
 * Group path commands into segments (each starting with moveTo)
 * This is used to work around Android WebGL rendering artifacts where
 * implicit lines are drawn between moveTo calls after arcs.
 */
export function groupPathCommandsIntoSegments(commands: PathCommand[]): PathCommand[][] {
    const segments: PathCommand[][] = [];
    let currentSegment: PathCommand[] = [];

    for (const cmd of commands) {
        if (cmd.type === 'moveTo' && currentSegment.length > 0) {
            // Start a new segment
            segments.push(currentSegment);
            currentSegment = [cmd];
        } else {
            currentSegment.push(cmd);
        }
    }

    // Push the last segment if it has commands
    if (currentSegment.length > 0) {
        segments.push(currentSegment);
    }

    return segments;
}

/**
 * Generate symmetric dashed line with flexible center dash
 * Ensures dashes match the corner pattern but adjusts the middle dash to fit
 */
function* generateSymmetricDashedLine(
    x1: number, y1: number,
    x2: number, y2: number,
    dashLen: number, gapLen: number
): Generator<PathCommand[]> {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const totalLen = Math.sqrt(dx * dx + dy * dy);

    // Need space for at least starting and ending gaps
    if (totalLen < 2 * gapLen) return;

    const ux = dx / totalLen;
    const uy = dy / totalLen;

    // Start filling after the initial gap
    const startPos = gapLen;
    const endPos = totalLen - gapLen;
    const fillLen = endPos - startPos;

    if (fillLen <= 0) return;

    // Calculate number of full dash+gap cycles per side
    // Pattern: [Dash, Gap, Dash, Gap ... Center ... Gap, Dash, Gap, Dash]
    // Center dash replaces one 'Dash' and absorbs remaining space
    const cycle = dashLen + gapLen;
    // Initial guess to ensure center >= dashLen
    let numSideCycles = Math.max(0, Math.floor((fillLen - dashLen) / (2 * cycle)));

    let centerLen = fillLen - (numSideCycles * 2 * cycle);

    // Max constraint: if center is too long, try adding more side cycles (split it)
    // But only if the new center is >= dashLen (min constraint takes priority)
    const maxCenterLen = 2 * dashLen + gapLen;
    while (centerLen > maxCenterLen) {
        const newCycles = numSideCycles + 1;
        const newCenterLen = fillLen - (newCycles * 2 * cycle);

        // Only increment if the new center is at least 1 dash length
        if (newCenterLen >= dashLen) {
            numSideCycles = newCycles;
            centerLen = newCenterLen;
        } else {
            break; // Can't split without making center too small - keep merged
        }
    }

    // Min constraint: if center is still too short, remove side cycles (merge dashes)
    while (centerLen < dashLen && numSideCycles > 0) {
        numSideCycles--;
        centerLen = fillLen - (numSideCycles * 2 * cycle);
    }

    // Draw Left Side
    let currentPos = startPos;
    for (let i = 0; i < numSideCycles; i++) {
        yield [
            { type: 'moveTo', x: x1 + ux * currentPos, y: y1 + uy * currentPos },
            { type: 'lineTo', x: x1 + ux * (currentPos + dashLen), y: y1 + uy * (currentPos + dashLen) }
        ];
        currentPos += cycle;
    }

    // Draw Right Side (backwards from end)
    for (let i = 0; i < numSideCycles; i++) {
        const dashEnd = endPos - i * cycle;
        const dashStart = dashEnd - dashLen;
        yield [
            { type: 'moveTo', x: x1 + ux * dashStart, y: y1 + uy * dashStart },
            { type: 'lineTo', x: x1 + ux * dashEnd, y: y1 + uy * dashEnd }
        ];
    }

    // Draw Center Dash
    // Connects the left and right sides
    const centerStart = startPos + numSideCycles * cycle;
    const centerEnd = endPos - numSideCycles * cycle;

    if (centerEnd > centerStart) {
        yield [
            { type: 'moveTo', x: x1 + ux * centerStart, y: y1 + uy * centerStart },
            { type: 'lineTo', x: x1 + ux * centerEnd, y: y1 + uy * centerEnd }
        ];
    }
}

function generateDashedLCorner(
    cornerX: number, cornerY: number,
    leg1DirX: number, leg1DirY: number,
    leg2DirX: number, leg2DirY: number,
    legLen: number
): PathCommand[] {
    const commands: PathCommand[] = [];

    // We want exactly 5 segments (dashes), symmetrically distributed around the corner.
    // The middle dash straddles the corner.
    //
    // Layout per leg (from Corner outward):
    // 1. Half of center dash (0 -> d/2)
    // 2. Gap (g)
    // 3. Full dash (d)
    // 4. Gap (g)
    // 5. Full dash (d)
    //
    // Total length on one leg: 0.5d + g + d + g + d = 2.5d + 2g
    // Using g = 0.6d (standard ratio): 2.5d + 1.2d = 3.7d
    // So legLen = 3.7d  =>  d = legLen / 3.7

    const d = legLen / 3.7;
    const g = d * 0.6;

    // CENTER L: Draw as a single continuous path so strokes join at the corner properly
    // This eliminates the gap on the outside edge
    commands.push({
        type: 'moveTo',
        x: cornerX + leg1DirX * (d / 2),
        y: cornerY + leg1DirY * (d / 2)
    });
    commands.push({
        type: 'lineTo',
        x: cornerX,
        y: cornerY
    });
    commands.push({
        type: 'lineTo',
        x: cornerX + leg2DirX * (d / 2),
        y: cornerY + leg2DirY * (d / 2)
    });

    // Helper to generate outer dashes for one leg (2 dashes after the center)
    const addLegDashes = (dirX: number, dirY: number) => {
        // Dash 2: d/2 + g to d/2 + g + d
        const start2 = d / 2 + g;
        const end2 = start2 + d;
        commands.push({
            type: 'moveTo',
            x: cornerX + dirX * start2,
            y: cornerY + dirY * start2
        });
        commands.push({
            type: 'lineTo',
            x: cornerX + dirX * end2,
            y: cornerY + dirY * end2
        });

        // Dash 3: end2 + g to end2 + g + d (should end at legLen)
        const start3 = end2 + g;
        const end3 = start3 + d;
        commands.push({
            type: 'moveTo',
            x: cornerX + dirX * start3,
            y: cornerY + dirY * start3
        });
        commands.push({
            type: 'lineTo',
            x: cornerX + dirX * end3,
            y: cornerY + dirY * end3
        });
    };

    addLegDashes(leg1DirX, leg1DirY);
    addLegDashes(leg2DirX, leg2DirY);

    return commands;
}

function generateDashedRoundedCorner(
    cx: number, cy: number, arcR: number,
    startAngle: number, endAngle: number,
    lineExtend: number,
    dashLen: number, // If > 0, use this fixed dash size (Legacy/Full Rect mode). If 0, use adaptive 5-segment mode.
    leg1StartX: number, leg1StartY: number, leg1DirX: number, leg1DirY: number,
    leg2EndX: number, leg2EndY: number, leg2DirX: number, leg2DirY: number
): PathCommand[] {
    const commands: PathCommand[] = [];
    const arcLen = Math.abs(endAngle - startAngle) * arcR;
    const angleTotal = endAngle - startAngle;

    // MODE 1: Fixed Dash Length (Legacy/Full Rect)
    // Used when dashLen is provided (must match adjacent edges)
    // This distributes dashes: 2 on leg1, 1 on arc, 2 on leg2 (if space permits)
    if (dashLen > 0) {
        const d = dashLen;
        const g = d * 0.6;

        // Center dash on arc
        const dCenter = Math.max(0, arcLen - 2 * g);

        // Leg 1
        commands.push({ type: 'moveTo', x: leg1StartX, y: leg1StartY });
        commands.push({ type: 'lineTo', x: leg1StartX + leg1DirX * d, y: leg1StartY + leg1DirY * d });

        const leg1Dash2Start = d + g;
        // Only draw 2nd dash if it fits within lineExtend (it should for full rects)
        if (leg1Dash2Start < lineExtend) {
            // Clamped to lineExtend to be safe, though full rects usually match exactly
            const t2 = Math.min(leg1Dash2Start + d, lineExtend);
            commands.push({ type: 'moveTo', x: leg1StartX + leg1DirX * leg1Dash2Start, y: leg1StartY + leg1DirY * leg1Dash2Start });
            commands.push({ type: 'lineTo', x: leg1StartX + leg1DirX * t2, y: leg1StartY + leg1DirY * t2 });
        }

        // Arc
        if (dCenter > 0) {
            const startRad = startAngle + angleTotal * (g / arcLen);
            const endRad = startAngle + angleTotal * ((g + dCenter) / arcLen);
            commands.push({ type: 'moveTo', x: cx + Math.cos(startRad) * arcR, y: cy + Math.sin(startRad) * arcR });
            commands.push({ type: 'arc', cx, cy, r: arcR, startAngle: startRad, endAngle: endRad });
        }

        // Leg 2
        const leg2OriginX = leg2EndX - leg2DirX * lineExtend;
        const leg2OriginY = leg2EndY - leg2DirY * lineExtend;

        commands.push({ type: 'moveTo', x: leg2OriginX, y: leg2OriginY });
        commands.push({ type: 'lineTo', x: leg2OriginX + leg2DirX * d, y: leg2OriginY + leg2DirY * d });

        // 2nd dash
        if (leg1Dash2Start < lineExtend) {
            const t2 = Math.min(leg1Dash2Start + d, lineExtend);
            commands.push({ type: 'moveTo', x: leg2OriginX + leg2DirX * leg1Dash2Start, y: leg2OriginY + leg2DirY * leg1Dash2Start });
            commands.push({ type: 'lineTo', x: leg2OriginX + leg2DirX * t2, y: leg2OriginY + leg2DirY * t2 });
        }

        return commands;
    }

    // MODE 2: Adaptive 5-Segment (Corner Only)
    // Used when dashLen is 0.
    // Total path length = leg1 + arc + leg2 = lineExtend + arcLen + lineExtend
    // We split this entire length into exactly 5 equal dashes and 4 gaps.

    const totalLen = 2 * lineExtend + arcLen;

    // 5 dashes with 4 gaps between them: D G D G D G D G D = 5d + 4g
    // With g = 0.6d: 5d + 2.4d = 7.4d
    const d = totalLen / 7.4;
    const g = d * 0.6;

    // Calculate positions along the entire path (leg1 -> arc -> leg2)
    // Path positions: 0 = start of leg1, lineExtend = start of arc, lineExtend + arcLen = start of leg2

    const dashPositions: { start: number; end: number }[] = [];
    let pos = 0;
    for (let i = 0; i < 5; i++) {
        dashPositions.push({ start: pos, end: pos + d });
        pos += d + g;
    }

    // Draw each dash based on its position along the path
    for (const dash of dashPositions) {
        const startPos = dash.start;
        const endPos = dash.end;

        // Leg 1: positions 0 to lineExtend (direction: leg1Dir from leg1Start)
        // Arc: positions lineExtend to lineExtend + arcLen
        // Leg 2: positions lineExtend + arcLen to totalLen (direction: leg2Dir from leg2Origin)

        if (endPos <= lineExtend && lineExtend > 0) {
            // Entirely on leg1
            const t1 = startPos;
            const t2 = endPos;
            commands.push({ type: 'moveTo', x: leg1StartX + leg1DirX * t1, y: leg1StartY + leg1DirY * t1 });
            commands.push({ type: 'lineTo', x: leg1StartX + leg1DirX * t2, y: leg1StartY + leg1DirY * t2 });
        } else if (startPos >= lineExtend + arcLen) {
            // Entirely on leg2
            const leg2OriginX = leg2EndX - leg2DirX * lineExtend;
            const leg2OriginY = leg2EndY - leg2DirY * lineExtend;
            const t1 = startPos - lineExtend - arcLen;
            const t2 = endPos - lineExtend - arcLen;
            commands.push({ type: 'moveTo', x: leg2OriginX + leg2DirX * t1, y: leg2OriginY + leg2DirY * t1 });
            commands.push({ type: 'lineTo', x: leg2OriginX + leg2DirX * t2, y: leg2OriginY + leg2DirY * t2 });
        } else if (startPos >= lineExtend && endPos <= lineExtend + arcLen) {
            // Entirely on arc
            const arcStart = startPos - lineExtend;
            const arcEnd = endPos - lineExtend;
            const startRad = startAngle + angleTotal * (arcStart / arcLen);
            const endRad = startAngle + angleTotal * (arcEnd / arcLen);
            commands.push({ type: 'moveTo', x: cx + Math.cos(startRad) * arcR, y: cy + Math.sin(startRad) * arcR });
            commands.push({ type: 'arc', cx, cy, r: arcR, startAngle: startRad, endAngle: endRad });
        } else {
            // Dash spans multiple segments - draw each part
            // Part on leg1
            if (startPos < lineExtend && lineExtend > 0) {
                const t1 = startPos;
                const t2 = Math.min(endPos, lineExtend);
                commands.push({ type: 'moveTo', x: leg1StartX + leg1DirX * t1, y: leg1StartY + leg1DirY * t1 });
                commands.push({ type: 'lineTo', x: leg1StartX + leg1DirX * t2, y: leg1StartY + leg1DirY * t2 });
            }
            // Part on arc
            const arcStartPos = Math.max(startPos, lineExtend) - lineExtend;
            const arcEndPos = Math.min(endPos, lineExtend + arcLen) - lineExtend;
            if (arcEndPos > arcStartPos) {
                const startRad = startAngle + angleTotal * (arcStartPos / arcLen);
                const endRad = startAngle + angleTotal * (arcEndPos / arcLen);
                commands.push({ type: 'moveTo', x: cx + Math.cos(startRad) * arcR, y: cy + Math.sin(startRad) * arcR });
                commands.push({ type: 'arc', cx, cy, r: arcR, startAngle: startRad, endAngle: endRad });
            }
            // Part on leg2
            if (endPos > lineExtend + arcLen) {
                const leg2OriginX = leg2EndX - leg2DirX * lineExtend;
                const leg2OriginY = leg2EndY - leg2DirY * lineExtend;
                const t1 = Math.max(startPos - lineExtend - arcLen, 0);
                const t2 = endPos - lineExtend - arcLen;
                commands.push({ type: 'moveTo', x: leg2OriginX + leg2DirX * t1, y: leg2OriginY + leg2DirY * t1 });
                commands.push({ type: 'lineTo', x: leg2OriginX + leg2DirX * t2, y: leg2OriginY + leg2DirY * t2 });
            }
        }
    }

    return commands;
}

/**
 * Generate per-card cut guide path for a specific style
 */
export function generatePerCardGuide(
    contentW: number,
    contentH: number,
    radiusPx: number,
    guideWidthPx: number,
    style: GuideStyle,
    placement: 'inside' | 'outside' | 'center',
    targetLegExtendPx: number // Explicit length for L-shaped corners (normally 6.25mm in px)
): PathCommand[] {
    const commands: PathCommand[] = [];
    const halfStroke = guideWidthPx / 2;
    // outside: inner edge at cut line, inside: outer edge at cut line, center: stroke straddles cut line
    const offset = placement === 'outside' ? -halfStroke : placement === 'inside' ? halfStroke : 0;

    const isRect = style.includes('rect');
    const isCorners = !isRect;
    const isRounded = style.includes('rounded');
    const isDashed = style.includes('dashed');

    if (isRect) {
        const r = isRounded ? radiusPx : 0;
        const x = offset;
        const y = offset;
        const w = contentW - 2 * offset;
        const h = contentH - 2 * offset;

        if (isDashed) {
            if (r > 0) {
                // Dashed rounded rect (FULL rectangle, not corners-only)
                // Use fixed lineExtend based on radius (not configurable guide length)
                // The configurable length only affects corners-only styles
                const lineExtend = r * 1.5;
                // Arc radius adjustment: outside extends outward, inside contracts inward, center straddles
                const arcR = Math.max(1, r + (placement === 'outside' ? halfStroke : placement === 'inside' ? -halfStroke : 0));

                // Calculate dash/gap to match the corner style exactly
                const cornerDash = lineExtend / 2.6;
                const cornerGap = cornerDash * 0.6;

                // Top-left corner - use r directly, like corners style
                commands.push(...generateDashedRoundedCorner(r, r, arcR, Math.PI, Math.PI * 1.5, lineExtend, cornerDash,
                    r - arcR, r + lineExtend, 0, -1,
                    r + lineExtend, r - arcR, 1, 0));

                // Top edge - connect the leg endpoints
                for (const seg of generateSymmetricDashedLine(r + lineExtend, r - arcR, contentW - r - lineExtend, r - arcR, cornerDash, cornerGap)) {
                    commands.push(...seg);
                }

                // Top-right corner
                commands.push(...generateDashedRoundedCorner(contentW - r, r, arcR, -Math.PI / 2, 0, lineExtend, cornerDash,
                    contentW - r - lineExtend, r - arcR, 1, 0,
                    contentW - r + arcR, r + lineExtend, 0, 1));

                // Right edge
                for (const seg of generateSymmetricDashedLine(contentW - r + arcR, r + lineExtend, contentW - r + arcR, contentH - r - lineExtend, cornerDash, cornerGap)) {
                    commands.push(...seg);
                }

                // Bottom-right corner
                commands.push(...generateDashedRoundedCorner(contentW - r, contentH - r, arcR, 0, Math.PI / 2, lineExtend, cornerDash,
                    contentW - r + arcR, contentH - r - lineExtend, 0, 1,
                    contentW - r - lineExtend, contentH - r + arcR, -1, 0));

                // Bottom edge
                for (const seg of generateSymmetricDashedLine(contentW - r - lineExtend, contentH - r + arcR, r + lineExtend, contentH - r + arcR, cornerDash, cornerGap)) {
                    commands.push(...seg);
                }

                // Bottom-left corner
                commands.push(...generateDashedRoundedCorner(r, contentH - r, arcR, Math.PI / 2, Math.PI, lineExtend, cornerDash,
                    r + lineExtend, contentH - r + arcR, -1, 0,
                    r - arcR, contentH - r - lineExtend, 0, -1));

                // Left edge
                for (const seg of generateSymmetricDashedLine(r - arcR, contentH - r - lineExtend, r - arcR, r + lineExtend, cornerDash, cornerGap)) {
                    commands.push(...seg);
                }
            } else {
                // Dashed square rect
                // We want to use the explicit target extension length (e.g. 6.25mm)
                // Leg Length = Target - Start = targetLegExtendPx - offset.
                const cornerLen = targetLegExtendPx - offset;

                // Match dash/gap size exactly to the corners
                // generateDashedLCorner uses: d = legLen / 3.7, g = d * 0.6
                // This ensures the visual style is identical between corners and edges
                const cornerDash = cornerLen / 3.7;
                const cornerGap = cornerDash * 0.6;

                // Corners
                commands.push(...generateDashedLCorner(x, y, 1, 0, 0, 1, cornerLen));
                commands.push(...generateDashedLCorner(x + w, y, -1, 0, 0, 1, cornerLen));
                commands.push(...generateDashedLCorner(x + w, y + h, -1, 0, 0, -1, cornerLen));
                commands.push(...generateDashedLCorner(x, y + h, 1, 0, 0, -1, cornerLen));

                // Edges - Symmetric with matching dash size
                for (const seg of generateSymmetricDashedLine(x + cornerLen, y, x + w - cornerLen, y, cornerDash, cornerGap)) {
                    commands.push(...seg);
                }
                for (const seg of generateSymmetricDashedLine(x + w, y + cornerLen, x + w, y + h - cornerLen, cornerDash, cornerGap)) {
                    commands.push(...seg);
                }
                for (const seg of generateSymmetricDashedLine(x + w - cornerLen, y + h, x + cornerLen, y + h, cornerDash, cornerGap)) {
                    commands.push(...seg);
                }
                for (const seg of generateSymmetricDashedLine(x, y + h - cornerLen, x, y + cornerLen, cornerDash, cornerGap)) {
                    commands.push(...seg);
                }
            }
        } else {
            // Solid rect - just one roundRect or rect command (handled by caller)
            // Return empty commands, caller will use native roundRect
        }
    } else if (isCorners) {
        // For rounded corners, the visual extent is measured from the corner vertex.
        // When targetLegExtendPx >= radiusPx: use full arc + straight line extension
        // When targetLegExtendPx < radiusPx: reduce the arc sweep angle proportionally
        const lineExtend = Math.max(0, targetLegExtendPx - radiusPx);

        // Calculate how much of the arc to draw (1.0 = full 90°, 0.5 = 45°, etc.)
        // When target < radius, we reduce the arc proportionally
        const arcFraction = targetLegExtendPx >= radiusPx ? 1.0 : targetLegExtendPx / radiusPx;

        if (isRounded) {
            // Arc radius adjustment: outside extends outward, inside contracts inward, center straddles
            const arcR = Math.max(1, radiusPx + (placement === 'outside' ? halfStroke : placement === 'inside' ? -halfStroke : 0));

            if (isDashed) {
                // Dashed rounded corners
                if (arcFraction >= 1) {
                    // Full arc + line extensions - function handles adaptive dash sizing internally
                    commands.push(...generateDashedRoundedCorner(radiusPx, radiusPx, arcR, Math.PI, Math.PI * 1.5, lineExtend, 0,
                        radiusPx - arcR, radiusPx + lineExtend, 0, -1,
                        radiusPx + lineExtend, radiusPx - arcR, 1, 0));

                    commands.push(...generateDashedRoundedCorner(contentW - radiusPx, radiusPx, arcR, -Math.PI / 2, 0, lineExtend, 0,
                        contentW - radiusPx - lineExtend, radiusPx - arcR, 1, 0,
                        contentW - radiusPx + arcR, radiusPx + lineExtend, 0, 1));

                    commands.push(...generateDashedRoundedCorner(contentW - radiusPx, contentH - radiusPx, arcR, 0, Math.PI / 2, lineExtend, 0,
                        contentW - radiusPx + arcR, contentH - radiusPx - lineExtend, 0, 1,
                        contentW - radiusPx - lineExtend, contentH - radiusPx + arcR, -1, 0));

                    commands.push(...generateDashedRoundedCorner(radiusPx, contentH - radiusPx, arcR, Math.PI / 2, Math.PI, lineExtend, 0,
                        radiusPx + lineExtend, contentH - radiusPx + arcR, -1, 0,
                        radiusPx - arcR, contentH - radiusPx - lineExtend, 0, -1));
                } else {
                    // Partial dashed arcs - draw 5 small dashes centered at the corner apex
                    // This maintains the dashed appearance even for short arcs
                    const totalArcAngle = (Math.PI / 2) * arcFraction;

                    // Split into 5 dashes with 4 gaps: 5d + 4g = 5d + 2.4d = 7.4d
                    const dashAngle = totalArcAngle / 7.4;
                    const gapAngle = dashAngle * 0.6;

                    // Helper to generate 5 dashes for a corner (centered at apex)
                    const addDashedCorner = (cx: number, cy: number, apex: number) => {
                        // Center dash (at apex)
                        commands.push({
                            type: 'arc', cx, cy, r: arcR,
                            startAngle: apex - dashAngle / 2,
                            endAngle: apex + dashAngle / 2
                        });
                        // Inner left dash
                        const innerLeftStart = apex - dashAngle / 2 - gapAngle - dashAngle;
                        commands.push({
                            type: 'arc', cx, cy, r: arcR,
                            startAngle: innerLeftStart,
                            endAngle: innerLeftStart + dashAngle
                        });
                        // Outer left dash
                        const outerLeftStart = innerLeftStart - gapAngle - dashAngle;
                        commands.push({
                            type: 'arc', cx, cy, r: arcR,
                            startAngle: outerLeftStart,
                            endAngle: outerLeftStart + dashAngle
                        });
                        // Inner right dash
                        const innerRightStart = apex + dashAngle / 2 + gapAngle;
                        commands.push({
                            type: 'arc', cx, cy, r: arcR,
                            startAngle: innerRightStart,
                            endAngle: innerRightStart + dashAngle
                        });
                        // Outer right dash
                        const outerRightStart = innerRightStart + dashAngle + gapAngle;
                        commands.push({
                            type: 'arc', cx, cy, r: arcR,
                            startAngle: outerRightStart,
                            endAngle: outerRightStart + dashAngle
                        });
                    };

                    // Top-left corner: apex at 1.25π (225°)
                    addDashedCorner(radiusPx, radiusPx, Math.PI * 1.25);
                    // Top-right corner: apex at -0.25π (-45° = 315°)
                    addDashedCorner(contentW - radiusPx, radiusPx, -Math.PI * 0.25);
                    // Bottom-right corner: apex at 0.25π (45°)
                    addDashedCorner(contentW - radiusPx, contentH - radiusPx, Math.PI * 0.25);
                    // Bottom-left corner: apex at 0.75π (135°)
                    addDashedCorner(radiusPx, contentH - radiusPx, Math.PI * 0.75);
                }
            } else {
                // Solid rounded corners
                // When arcFraction < 1, we draw partial arcs (no straight extensions)
                // Each leg draws from its edge toward the corner apex
                const halfArc = (Math.PI / 2) * arcFraction * 0.5; // Half the arc per leg

                if (arcFraction >= 1) {
                    // Full arc + straight line extensions
                    // Top-left
                    commands.push({ type: 'moveTo', x: radiusPx - arcR, y: radiusPx + lineExtend });
                    commands.push({ type: 'lineTo', x: radiusPx - arcR, y: radiusPx });
                    commands.push({ type: 'arc', cx: radiusPx, cy: radiusPx, r: arcR, startAngle: Math.PI, endAngle: Math.PI * 1.5 });
                    commands.push({ type: 'moveTo', x: radiusPx, y: radiusPx - arcR });
                    commands.push({ type: 'lineTo', x: radiusPx + lineExtend, y: radiusPx - arcR });

                    // Top-right
                    commands.push({ type: 'moveTo', x: contentW - radiusPx - lineExtend, y: radiusPx - arcR });
                    commands.push({ type: 'lineTo', x: contentW - radiusPx, y: radiusPx - arcR });
                    commands.push({ type: 'arc', cx: contentW - radiusPx, cy: radiusPx, r: arcR, startAngle: -Math.PI / 2, endAngle: 0 });
                    commands.push({ type: 'moveTo', x: contentW - radiusPx + arcR, y: radiusPx });
                    commands.push({ type: 'lineTo', x: contentW - radiusPx + arcR, y: radiusPx + lineExtend });

                    // Bottom-right
                    commands.push({ type: 'moveTo', x: contentW - radiusPx + arcR, y: contentH - radiusPx - lineExtend });
                    commands.push({ type: 'lineTo', x: contentW - radiusPx + arcR, y: contentH - radiusPx });
                    commands.push({ type: 'arc', cx: contentW - radiusPx, cy: contentH - radiusPx, r: arcR, startAngle: 0, endAngle: Math.PI / 2 });
                    commands.push({ type: 'moveTo', x: contentW - radiusPx, y: contentH - radiusPx + arcR });
                    commands.push({ type: 'lineTo', x: contentW - radiusPx - lineExtend, y: contentH - radiusPx + arcR });

                    // Bottom-left
                    commands.push({ type: 'moveTo', x: radiusPx + lineExtend, y: contentH - radiusPx + arcR });
                    commands.push({ type: 'lineTo', x: radiusPx, y: contentH - radiusPx + arcR });
                    commands.push({ type: 'arc', cx: radiusPx, cy: contentH - radiusPx, r: arcR, startAngle: Math.PI / 2, endAngle: Math.PI });
                    commands.push({ type: 'moveTo', x: radiusPx - arcR, y: contentH - radiusPx });
                    commands.push({ type: 'lineTo', x: radiusPx - arcR, y: contentH - radiusPx - lineExtend });
                } else {
                    // Partial arcs - draw a single arc centered at the corner apex (45° mark)
                    // This keeps the guide connected in the middle and shrinks symmetrically

                    // Top-left corner: apex at 1.25π (225°)
                    const tlApex = Math.PI * 1.25;
                    commands.push({ type: 'arc', cx: radiusPx, cy: radiusPx, r: arcR, startAngle: tlApex - halfArc, endAngle: tlApex + halfArc });

                    // Top-right corner: apex at -0.25π (-45° = 315°)
                    const trApex = -Math.PI * 0.25;
                    commands.push({ type: 'arc', cx: contentW - radiusPx, cy: radiusPx, r: arcR, startAngle: trApex - halfArc, endAngle: trApex + halfArc });

                    // Bottom-right corner: apex at 0.25π (45°)
                    const brApex = Math.PI * 0.25;
                    commands.push({ type: 'arc', cx: contentW - radiusPx, cy: contentH - radiusPx, r: arcR, startAngle: brApex - halfArc, endAngle: brApex + halfArc });

                    // Bottom-left corner: apex at 0.75π (135°)
                    const blApex = Math.PI * 0.75;
                    commands.push({ type: 'arc', cx: radiusPx, cy: contentH - radiusPx, r: arcR, startAngle: blApex - halfArc, endAngle: blApex + halfArc });
                }
            }
        } else {
            // L-shaped corners
            // Use explicit target extension length (matches rounded corners visual extent)
            // Start point is 'offset'
            const totalExtend = targetLegExtendPx - offset;

            if (isDashed) {
                commands.push(...generateDashedLCorner(offset, offset, 1, 0, 0, 1, totalExtend));
                commands.push(...generateDashedLCorner(contentW - offset, offset, -1, 0, 0, 1, totalExtend));
                commands.push(...generateDashedLCorner(contentW - offset, contentH - offset, -1, 0, 0, -1, totalExtend));
                commands.push(...generateDashedLCorner(offset, contentH - offset, 1, 0, 0, -1, totalExtend));
            } else {
                // Solid L-corners
                const x = offset;
                const y = offset;
                const w = contentW - 2 * offset;
                const h = contentH - 2 * offset;

                commands.push({ type: 'moveTo', x: x + totalExtend, y });
                commands.push({ type: 'lineTo', x, y });
                commands.push({ type: 'lineTo', x, y: y + totalExtend });

                commands.push({ type: 'moveTo', x: x + w - totalExtend, y });
                commands.push({ type: 'lineTo', x: x + w, y });
                commands.push({ type: 'lineTo', x: x + w, y: y + totalExtend });

                commands.push({ type: 'moveTo', x: x + w, y: y + h - totalExtend });
                commands.push({ type: 'lineTo', x: x + w, y: y + h });
                commands.push({ type: 'lineTo', x: x + w - totalExtend, y: y + h });

                commands.push({ type: 'moveTo', x: x + totalExtend, y: y + h });
                commands.push({ type: 'lineTo', x, y: y + h });
                commands.push({ type: 'lineTo', x, y: y + h - totalExtend });
            }
        }
    }

    return commands;
}
