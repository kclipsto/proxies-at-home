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



/**
 * Calculate dash/gap sizes based on guide width
 */


/**
 * Generate dashed rounded corner path with exactly 5 equal dashes
 * Dashes are sized proportionally to corner path length for consistency
 */


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
    leg1StartX: number, leg1StartY: number, leg1DirX: number, leg1DirY: number,
    leg2EndX: number, leg2EndY: number, leg2DirX: number, leg2DirY: number
): PathCommand[] {
    const commands: PathCommand[] = [];
    const arcLen = Math.abs(endAngle - startAngle) * arcR;

    // We want the straight extensions to contain exactly 2 dashes and 1 gap (D - G - D)
    // pattern: d + g + d = 2.6d
    // So d = lineExtend / 2.6
    const d = lineExtend / 2.6;
    const g = d * 0.6;

    // The arc contains the center dash and two surrounding gaps (G - CenterD - G)
    // So centerD = arcLen - 2g
    // This allows the gaps to straddle the precise junction between straight and arc
    const dCenter = Math.max(0, arcLen - 2 * g);

    // --- Leg 1 (Straight) ---
    // Dash 1
    commands.push({ type: 'moveTo', x: leg1StartX, y: leg1StartY });
    commands.push({ type: 'lineTo', x: leg1StartX + leg1DirX * d, y: leg1StartY + leg1DirY * d });

    // Dash 2 (starts after gap)
    const leg1Dash2Start = d + g;
    commands.push({ type: 'moveTo', x: leg1StartX + leg1DirX * leg1Dash2Start, y: leg1StartY + leg1DirY * leg1Dash2Start });
    commands.push({ type: 'lineTo', x: leg1StartX + leg1DirX * (leg1Dash2Start + d), y: leg1StartY + leg1DirY * (leg1Dash2Start + d) });
    // This ends exactly at lineExtend (the junction)

    // --- Arc ---
    // Gaps consume 'g' from start and end of arc.
    // Center Dash is between them.
    if (dCenter > 0) {
        const angleTotal = endAngle - startAngle;
        const startRad = startAngle + angleTotal * (g / arcLen);
        const endRad = startAngle + angleTotal * ((g + dCenter) / arcLen);

        commands.push({ type: 'moveTo', x: cx + Math.cos(startRad) * arcR, y: cy + Math.sin(startRad) * arcR });
        commands.push({ type: 'arc', cx, cy, r: arcR, startAngle: startRad, endAngle: endRad });
    }

    // --- Leg 2 (Straight) ---
    // Mirror of Leg 1, but drawing "forward" along the path
    // Path starts at Leg 2 "Start" (which is junction) and goes to End.
    // Leg 2 Start Point: leg2EndX - leg2DirX * lineExtend
    const leg2OriginX = leg2EndX - leg2DirX * lineExtend;
    const leg2OriginY = leg2EndY - leg2DirY * lineExtend;

    // Dash 1 (starts at junction)
    commands.push({ type: 'moveTo', x: leg2OriginX, y: leg2OriginY });
    commands.push({ type: 'lineTo', x: leg2OriginX + leg2DirX * d, y: leg2OriginY + leg2DirY * d });

    // Dash 2 (after gap)
    const leg2Dash2Start = d + g;
    commands.push({ type: 'moveTo', x: leg2OriginX + leg2DirX * leg2Dash2Start, y: leg2OriginY + leg2DirY * leg2Dash2Start });
    commands.push({ type: 'lineTo', x: leg2OriginX + leg2DirX * (leg2Dash2Start + d), y: leg2OriginY + leg2DirY * (leg2Dash2Start + d) });

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
                // Dashed rounded rect
                // Use SAME coordinate system as dashed-rounded-corners (no offset in arc centers)
                // Placement is handled purely through arcR adjustment
                const lineExtend = r * 1.5;
                // Arc radius adjustment: outside extends outward, inside contracts inward, center straddles
                const arcR = Math.max(1, r + (placement === 'outside' ? halfStroke : placement === 'inside' ? -halfStroke : 0));

                // Calculate dash/gap to match the corner style exactly
                const cornerDash = lineExtend / 2.6;
                const cornerGap = cornerDash * 0.6;

                // Top-left corner - use r directly, like corners style
                commands.push(...generateDashedRoundedCorner(r, r, arcR, Math.PI, Math.PI * 1.5, lineExtend,
                    r - arcR, r + lineExtend, 0, -1,
                    r + lineExtend, r - arcR, 1, 0));

                // Top edge - connect the leg endpoints
                for (const seg of generateSymmetricDashedLine(r + lineExtend, r - arcR, contentW - r - lineExtend, r - arcR, cornerDash, cornerGap)) {
                    commands.push(...seg);
                }

                // Top-right corner
                commands.push(...generateDashedRoundedCorner(contentW - r, r, arcR, -Math.PI / 2, 0, lineExtend,
                    contentW - r - lineExtend, r - arcR, 1, 0,
                    contentW - r + arcR, r + lineExtend, 0, 1));

                // Right edge
                for (const seg of generateSymmetricDashedLine(contentW - r + arcR, r + lineExtend, contentW - r + arcR, contentH - r - lineExtend, cornerDash, cornerGap)) {
                    commands.push(...seg);
                }

                // Bottom-right corner
                commands.push(...generateDashedRoundedCorner(contentW - r, contentH - r, arcR, 0, Math.PI / 2, lineExtend,
                    contentW - r + arcR, contentH - r - lineExtend, 0, 1,
                    contentW - r - lineExtend, contentH - r + arcR, -1, 0));

                // Bottom edge
                for (const seg of generateSymmetricDashedLine(contentW - r - lineExtend, contentH - r + arcR, r + lineExtend, contentH - r + arcR, cornerDash, cornerGap)) {
                    commands.push(...seg);
                }

                // Bottom-left corner
                commands.push(...generateDashedRoundedCorner(r, contentH - r, arcR, Math.PI / 2, Math.PI, lineExtend,
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
        const lineExtend = radiusPx * 1.5;

        if (isRounded) {
            // Arc radius adjustment: outside extends outward, inside contracts inward, center straddles
            const arcR = Math.max(1, radiusPx + (placement === 'outside' ? halfStroke : placement === 'inside' ? -halfStroke : 0));

            if (isDashed) {
                // Dashed rounded corners
                commands.push(...generateDashedRoundedCorner(radiusPx, radiusPx, arcR, Math.PI, Math.PI * 1.5, lineExtend,
                    radiusPx - arcR, radiusPx + lineExtend, 0, -1,
                    radiusPx + lineExtend, radiusPx - arcR, 1, 0));

                commands.push(...generateDashedRoundedCorner(contentW - radiusPx, radiusPx, arcR, -Math.PI / 2, 0, lineExtend,
                    contentW - radiusPx - lineExtend, radiusPx - arcR, 1, 0,
                    contentW - radiusPx + arcR, radiusPx + lineExtend, 0, 1));

                commands.push(...generateDashedRoundedCorner(contentW - radiusPx, contentH - radiusPx, arcR, 0, Math.PI / 2, lineExtend,
                    contentW - radiusPx + arcR, contentH - radiusPx - lineExtend, 0, 1,
                    contentW - radiusPx - lineExtend, contentH - radiusPx + arcR, -1, 0));

                commands.push(...generateDashedRoundedCorner(radiusPx, contentH - radiusPx, arcR, Math.PI / 2, Math.PI, lineExtend,
                    radiusPx + lineExtend, contentH - radiusPx + arcR, -1, 0,
                    radiusPx - arcR, contentH - radiusPx - lineExtend, 0, -1));
            } else {
                // Solid rounded corners
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
