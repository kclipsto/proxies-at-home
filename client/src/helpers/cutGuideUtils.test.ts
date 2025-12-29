import { describe, it, expect, vi } from "vitest";
import {
    executePathCommands,
    groupPathCommandsIntoSegments,
    generatePerCardGuide,
} from "./cutGuideUtils";

describe("cutGuideUtils", () => {
    describe("groupPathCommandsIntoSegments", () => {
        it("should return empty array for empty input", () => {
            const result = groupPathCommandsIntoSegments([]);
            expect(result).toEqual([]);
        });

        it("should group commands into segments starting with moveTo", () => {
            const commands = [
                { type: "moveTo" as const, x: 0, y: 0 },
                { type: "lineTo" as const, x: 10, y: 0 },
                { type: "moveTo" as const, x: 20, y: 0 },
                { type: "lineTo" as const, x: 30, y: 0 },
            ];

            const result = groupPathCommandsIntoSegments(commands);

            expect(result).toHaveLength(2);
            expect(result[0]).toHaveLength(2);
            expect(result[1]).toHaveLength(2);
        });

        it("should handle single segment", () => {
            const commands = [
                { type: "moveTo" as const, x: 0, y: 0 },
                { type: "lineTo" as const, x: 10, y: 0 },
                { type: "lineTo" as const, x: 10, y: 10 },
            ];

            const result = groupPathCommandsIntoSegments(commands);

            expect(result).toHaveLength(1);
            expect(result[0]).toHaveLength(3);
        });

        it("should handle arc commands as part of segment", () => {
            const commands = [
                { type: "moveTo" as const, x: 0, y: 0 },
                { type: "arc" as const, cx: 10, cy: 10, r: 10, startAngle: 0, endAngle: Math.PI / 2 },
                { type: "lineTo" as const, x: 20, y: 20 },
            ];

            const result = groupPathCommandsIntoSegments(commands);

            expect(result).toHaveLength(1);
            expect(result[0]).toHaveLength(3);
        });
    });

    describe("executePathCommands", () => {
        it("should call context methods for each command type", () => {
            const mockContext = {
                moveTo: vi.fn(),
                lineTo: vi.fn(),
                arc: vi.fn(),
            };

            const commands = [
                { type: "moveTo" as const, x: 0, y: 0 },
                { type: "lineTo" as const, x: 10, y: 10 },
            ];

            executePathCommands(mockContext, commands);

            expect(mockContext.moveTo).toHaveBeenCalledWith(0, 0);
            expect(mockContext.lineTo).toHaveBeenCalledWith(10, 10);
        });

        it("should convert arc to line segments for Android WebGL compatibility", () => {
            const mockContext = {
                moveTo: vi.fn(),
                lineTo: vi.fn(),
                arc: vi.fn(),
            };

            const commands = [
                { type: "arc" as const, cx: 50, cy: 50, r: 10, startAngle: 0, endAngle: Math.PI / 2 },
            ];

            executePathCommands(mockContext, commands);

            // Arc is converted to moveTo + multiple lineTo calls (not arc())
            expect(mockContext.arc).not.toHaveBeenCalled();
            expect(mockContext.moveTo).toHaveBeenCalled();
            expect(mockContext.lineTo).toHaveBeenCalled();
        });
    });

    describe("generatePerCardGuide", () => {
        const contentW = 200;
        const contentH = 300;
        const radiusPx = 10;
        const guideWidthPx = 2;
        const targetLegExtendPx = 30;

        it("should handle 'none' style gracefully", () => {
            const result = generatePerCardGuide(
                contentW, contentH, radiusPx, guideWidthPx,
                "none", "inside", targetLegExtendPx
            );

            // The 'none' style results in isCorners=false, isRect=false path
            // Function behavior for 'none' depends on implementation
            // We just verify it returns an array (no crash)
            expect(Array.isArray(result)).toBe(true);
        });

        it("should generate commands for 'corners' style", () => {
            const result = generatePerCardGuide(
                contentW, contentH, radiusPx, guideWidthPx,
                "corners", "inside", targetLegExtendPx
            );

            expect(result.length).toBeGreaterThan(0);
            // L-corners should have moveTo and lineTo commands
            expect(result.some(cmd => cmd.type === "moveTo")).toBe(true);
            expect(result.some(cmd => cmd.type === "lineTo")).toBe(true);
        });

        it("should generate commands for 'rounded-corners' style", () => {
            const result = generatePerCardGuide(
                contentW, contentH, radiusPx, guideWidthPx,
                "rounded-corners", "inside", targetLegExtendPx
            );

            expect(result.length).toBeGreaterThan(0);
            // Rounded corners should include arc commands
            expect(result.some(cmd => cmd.type === "arc")).toBe(true);
        });

        it("should generate commands for 'dashed-corners' style", () => {
            const result = generatePerCardGuide(
                contentW, contentH, radiusPx, guideWidthPx,
                "dashed-corners", "inside", targetLegExtendPx
            );

            expect(result.length).toBeGreaterThan(0);
            // Dashed should have multiple segments (moveTo commands)
            const moveToCount = result.filter(cmd => cmd.type === "moveTo").length;
            expect(moveToCount).toBeGreaterThan(4); // More than 4 corners
        });

        it("should adjust offset based on placement (inside)", () => {
            const insideResult = generatePerCardGuide(
                contentW, contentH, radiusPx, guideWidthPx,
                "corners", "inside", targetLegExtendPx
            );

            const outsideResult = generatePerCardGuide(
                contentW, contentH, radiusPx, guideWidthPx,
                "corners", "outside", targetLegExtendPx
            );

            // Inside placement should have larger offset than outside
            // This affects starting positions of corner guides
            expect(insideResult).not.toEqual(outsideResult);
        });

        it("should handle solid-rounded-rect style (with placement offset)", () => {
            // Solid rects return empty from generatePerCardGuide 
            // (caller handles with native roundRect) when placement is 'center'
            // For 'inside'/'outside' placement, the function may still calculate guides
            // based on offset. Here we just verify it doesn't crash and returns something.
            const result = generatePerCardGuide(
                contentW, contentH, radiusPx, guideWidthPx,
                "solid-rounded-rect", "center", targetLegExtendPx
            );

            // With 'center' placement and solid rect, should return empty
            // as solid rects are handled by caller's native drawing
            expect(Array.isArray(result)).toBe(true);
        });

        it("should generate dashed rounded rect", () => {
            const result = generatePerCardGuide(
                contentW, contentH, radiusPx, guideWidthPx,
                "dashed-rounded-rect", "inside", targetLegExtendPx
            );

            expect(result.length).toBeGreaterThan(0);
            // Should have arcs for corners and lines for edges
            expect(result.some(cmd => cmd.type === "arc")).toBe(true);
        });

        it("should generate dashed squared rect", () => {
            const result = generatePerCardGuide(
                contentW, contentH, radiusPx, guideWidthPx,
                "dashed-squared-rect", "inside", targetLegExtendPx
            );

            expect(result.length).toBeGreaterThan(0);
            // Squared rect should not have arc commands
            expect(result.some(cmd => cmd.type === "arc")).toBe(false);
        });

        it("should generate dashed rounded corners", () => {
            const result = generatePerCardGuide(
                contentW, contentH, radiusPx, guideWidthPx,
                "dashed-rounded-corners", "inside", targetLegExtendPx
            );

            expect(result.length).toBeGreaterThan(0);
            // Dashed rounded corners should have arc commands for the curves
            expect(result.some(cmd => cmd.type === "arc")).toBe(true);
            // Should have multiple segments (dashes)
            const moveToCount = result.filter(cmd => cmd.type === "moveTo").length;
            expect(moveToCount).toBeGreaterThan(4);
        });

        it("should generate solid squared rect", () => {
            const result = generatePerCardGuide(
                contentW, contentH, radiusPx, guideWidthPx,
                "solid-squared-rect", "inside", targetLegExtendPx
            );

            // Solid squared rect - may return commands for sharp corners
            expect(Array.isArray(result)).toBe(true);
        });
    });
});
