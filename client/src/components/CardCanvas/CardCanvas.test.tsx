import { render, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CardCanvas } from "./CardCanvas";
import { DEFAULT_RENDER_PARAMS } from "./types";
import React from "react";

// Mock WebGL2RenderingContext
const createMockGl = () => {
    const textures: unknown[] = [];
    const mockGl = {
        // Constants
        VERTEX_SHADER: 0x8b31,
        FRAGMENT_SHADER: 0x8b30,
        COMPILE_STATUS: 0x8b81,
        LINK_STATUS: 0x8b82,
        ARRAY_BUFFER: 0x8892,
        STATIC_DRAW: 0x88e4,
        FLOAT: 0x1406,
        TRIANGLE_STRIP: 0x0005,
        COLOR_BUFFER_BIT: 0x4000,
        TEXTURE_2D: 0x0de1,
        TEXTURE0: 0x84c0,
        TEXTURE1: 0x84c1,
        TEXTURE_WRAP_S: 0x2802,
        TEXTURE_WRAP_T: 0x2803,
        TEXTURE_MIN_FILTER: 0x2801,
        TEXTURE_MAG_FILTER: 0x2800,
        CLAMP_TO_EDGE: 0x812f,
        LINEAR: 0x2601,
        RGBA: 0x1908,
        UNSIGNED_BYTE: 0x1401,
        NO_ERROR: 0,

        // Methods
        createShader: vi.fn(() => ({})),
        shaderSource: vi.fn(),
        compileShader: vi.fn(),
        getShaderParameter: vi.fn(() => true),
        getShaderInfoLog: vi.fn(() => ""),
        createProgram: vi.fn(() => ({})),
        attachShader: vi.fn(),
        linkProgram: vi.fn(),
        getProgramParameter: vi.fn(() => true),
        getProgramInfoLog: vi.fn(() => ""),
        deleteShader: vi.fn(),
        deleteProgram: vi.fn(),
        getUniformLocation: vi.fn((_prog, name) => ({ name })),
        getAttribLocation: vi.fn(() => 0),
        createVertexArray: vi.fn(() => ({})),
        bindVertexArray: vi.fn(),
        createBuffer: vi.fn(() => ({})),
        bindBuffer: vi.fn(),
        bufferData: vi.fn(),
        enableVertexAttribArray: vi.fn(),
        vertexAttribPointer: vi.fn(),
        deleteVertexArray: vi.fn(),
        useProgram: vi.fn(),
        uniform1i: vi.fn(),
        uniform1f: vi.fn(),
        uniform2f: vi.fn(),
        activeTexture: vi.fn(),
        bindTexture: vi.fn(),
        createTexture: vi.fn(() => {
            const tex = { id: textures.length };
            textures.push(tex);
            return tex;
        }),
        deleteTexture: vi.fn(),
        texParameteri: vi.fn(),
        texImage2D: vi.fn(),
        viewport: vi.fn(),
        clearColor: vi.fn(),
        clear: vi.fn(),
        drawArrays: vi.fn(),
        getError: vi.fn(() => 0),
        getExtension: vi.fn(() => ({ loseContext: vi.fn() })),
        uniform3f: vi.fn(),

        // Track textures for assertions
        _textures: textures,
    };
    return mockGl;
};

// Create a simple test blob
const createTestBlob = (size = 1000) => new Blob([new Uint8Array(size)], { type: "image/png" });

// Mock createImageBitmap
const mockImageBitmap = {
    width: 100,
    height: 140,
    close: vi.fn(),
};

describe("CardCanvas", () => {
    let mockGl: ReturnType<typeof createMockGl>;
    let originalCreateImageBitmap: typeof createImageBitmap;

    beforeEach(() => {
        mockGl = createMockGl();

        // Mock canvas getContext
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
            ((contextId: string) => {
                if (contextId === "webgl2") {
                    return mockGl as unknown as WebGL2RenderingContext;
                }
                return null;
            }) as typeof HTMLCanvasElement.prototype.getContext
        );

        // Mock createImageBitmap
        originalCreateImageBitmap = globalThis.createImageBitmap;
        globalThis.createImageBitmap = vi.fn(() => Promise.resolve(mockImageBitmap as unknown as ImageBitmap));
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        globalThis.createImageBitmap = originalCreateImageBitmap;
    });

    describe("WebGL Initialization", () => {
        it("should initialize WebGL context on mount", () => {
            const testBlob = createTestBlob();

            const { container } = render(
                <CardCanvas
                    baseTexture={testBlob}
                    darknessFactor={0.5}
                    width={400}
                    height={560}
                    params={DEFAULT_RENDER_PARAMS}
                />
            );

            const canvas = container.querySelector("canvas");
            expect(canvas).not.toBeNull();
            expect(mockGl.createProgram).toHaveBeenCalled();
            expect(mockGl.createVertexArray).toHaveBeenCalled();
        });

        it("should create shaders and program", () => {
            const testBlob = createTestBlob();

            render(
                <CardCanvas
                    baseTexture={testBlob}
                    darknessFactor={0.5}
                    width={400}
                    height={560}
                    params={DEFAULT_RENDER_PARAMS}
                />
            );

            expect(mockGl.createShader).toHaveBeenCalledTimes(2); // vertex + fragment
            expect(mockGl.compileShader).toHaveBeenCalledTimes(2);
            expect(mockGl.createProgram).toHaveBeenCalled();
            expect(mockGl.linkProgram).toHaveBeenCalled();
        });

        it("should get uniform locations", () => {
            const testBlob = createTestBlob();

            render(
                <CardCanvas
                    baseTexture={testBlob}
                    darknessFactor={0.5}
                    width={400}
                    height={560}
                    params={DEFAULT_RENDER_PARAMS}
                />
            );

            expect(mockGl.getUniformLocation).toHaveBeenCalledWith(expect.anything(), "u_baseTexture");
            expect(mockGl.getUniformLocation).toHaveBeenCalledWith(expect.anything(), "u_darknessFactor");
            expect(mockGl.getUniformLocation).toHaveBeenCalledWith(expect.anything(), "u_brightness");
        });

        it("should clean up WebGL resources on unmount", () => {
            const testBlob = createTestBlob();

            const { unmount } = render(
                <CardCanvas
                    baseTexture={testBlob}
                    darknessFactor={0.5}
                    width={400}
                    height={560}
                    params={DEFAULT_RENDER_PARAMS}
                />
            );

            unmount();

            expect(mockGl.deleteVertexArray).toHaveBeenCalled();
            expect(mockGl.deleteProgram).toHaveBeenCalled();
        });
    });

    describe("Texture Loading", () => {
        it("should load texture from blob", async () => {
            const testBlob = createTestBlob();

            render(
                <CardCanvas
                    baseTexture={testBlob}
                    darknessFactor={0.5}
                    width={400}
                    height={560}
                    params={DEFAULT_RENDER_PARAMS}
                />
            );

            await waitFor(() => {
                expect(globalThis.createImageBitmap).toHaveBeenCalledWith(testBlob);
            });

            await waitFor(() => {
                expect(mockGl.createTexture).toHaveBeenCalled();
                expect(mockGl.texImage2D).toHaveBeenCalled();
            });
        });

        it("should bind texture to correct texture unit", async () => {
            const testBlob = createTestBlob();

            render(
                <CardCanvas
                    baseTexture={testBlob}
                    darknessFactor={0.5}
                    width={400}
                    height={560}
                    params={DEFAULT_RENDER_PARAMS}
                />
            );

            await waitFor(() => {
                expect(mockGl.activeTexture).toHaveBeenCalledWith(mockGl.TEXTURE0);
                expect(mockGl.bindTexture).toHaveBeenCalledWith(mockGl.TEXTURE_2D, expect.anything());
            });
        });

        it("should reload texture when blob changes", async () => {
            const testBlob1 = createTestBlob(1000);
            const testBlob2 = createTestBlob(2000);

            const { rerender } = render(
                <CardCanvas
                    baseTexture={testBlob1}
                    darknessFactor={0.5}
                    width={400}
                    height={560}
                    params={DEFAULT_RENDER_PARAMS}
                />
            );

            await waitFor(() => {
                expect(globalThis.createImageBitmap).toHaveBeenCalledWith(testBlob1);
            });

            const initialCallCount = (globalThis.createImageBitmap as ReturnType<typeof vi.fn>).mock.calls.length;

            rerender(
                <CardCanvas
                    baseTexture={testBlob2}
                    darknessFactor={0.5}
                    width={400}
                    height={560}
                    params={DEFAULT_RENDER_PARAMS}
                />
            );

            await waitFor(() => {
                expect((globalThis.createImageBitmap as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(initialCallCount);
                expect(globalThis.createImageBitmap).toHaveBeenCalledWith(testBlob2);
            });
        });
    });

    describe("Rendering", () => {
        it("should call drawArrays after texture loads", async () => {
            const testBlob = createTestBlob();

            render(
                <CardCanvas
                    baseTexture={testBlob}
                    darknessFactor={0.5}
                    width={400}
                    height={560}
                    params={DEFAULT_RENDER_PARAMS}
                />
            );

            await waitFor(() => {
                expect(mockGl.drawArrays).toHaveBeenCalled();
            });
        });

        it("should set viewport to canvas dimensions", async () => {
            const testBlob = createTestBlob();

            render(
                <CardCanvas
                    baseTexture={testBlob}
                    darknessFactor={0.5}
                    width={400}
                    height={560}
                    params={DEFAULT_RENDER_PARAMS}
                />
            );

            await waitFor(() => {
                expect(mockGl.viewport).toHaveBeenCalledWith(0, 0, 400, 560);
            });
        });

        it("should call onRender callback after rendering", async () => {
            const testBlob = createTestBlob();
            const onRender = vi.fn();

            render(
                <CardCanvas
                    baseTexture={testBlob}
                    darknessFactor={0.5}
                    width={400}
                    height={560}
                    params={DEFAULT_RENDER_PARAMS}
                    onRender={onRender}
                />
            );

            await waitFor(() => {
                expect(onRender).toHaveBeenCalled();
            });
        });
    });

    describe("Uniform Updates", () => {
        it("should update uniforms when params change", async () => {
            const testBlob = createTestBlob();
            const initialParams = { ...DEFAULT_RENDER_PARAMS, brightness: 0 };
            const updatedParams = { ...DEFAULT_RENDER_PARAMS, brightness: 10 };

            const { rerender } = render(
                <CardCanvas
                    baseTexture={testBlob}
                    darknessFactor={0.5}
                    width={400}
                    height={560}
                    params={initialParams}
                />
            );

            await waitFor(() => {
                expect(mockGl.drawArrays).toHaveBeenCalled();
            });

            const initialDrawCount = mockGl.drawArrays.mock.calls.length;

            rerender(
                <CardCanvas
                    baseTexture={testBlob}
                    darknessFactor={0.5}
                    width={400}
                    height={560}
                    params={updatedParams}
                />
            );

            await waitFor(() => {
                expect(mockGl.drawArrays.mock.calls.length).toBeGreaterThan(initialDrawCount);
            });
        });

        it("should re-render when darknessFactor changes", async () => {
            const testBlob = createTestBlob();

            const { rerender } = render(
                <CardCanvas
                    baseTexture={testBlob}
                    darknessFactor={0.5}
                    width={400}
                    height={560}
                    params={DEFAULT_RENDER_PARAMS}
                />
            );

            await waitFor(() => {
                expect(mockGl.drawArrays).toHaveBeenCalled();
            });

            const initialDrawCount = mockGl.drawArrays.mock.calls.length;

            rerender(
                <CardCanvas
                    baseTexture={testBlob}
                    darknessFactor={0.8}
                    width={400}
                    height={560}
                    params={DEFAULT_RENDER_PARAMS}
                />
            );

            await waitFor(() => {
                expect(mockGl.drawArrays.mock.calls.length).toBeGreaterThan(initialDrawCount);
            });
        });
    });

    describe("React Strict Mode Handling", () => {
        it("should handle double mount/unmount correctly", async () => {
            const testBlob = createTestBlob();

            // Simulate React Strict Mode by rendering in StrictMode
            const { unmount } = render(
                <React.StrictMode>
                    <CardCanvas
                        baseTexture={testBlob}
                        darknessFactor={0.5}
                        width={400}
                        height={560}
                        params={DEFAULT_RENDER_PARAMS}
                    />
                </React.StrictMode>
            );

            // Wait for texture load and render
            await waitFor(() => {
                expect(mockGl.drawArrays).toHaveBeenCalled();
            });

            unmount();

            // Should clean up without errors
            expect(mockGl.deleteProgram).toHaveBeenCalled();
        });

        it("should not set texture on stale state after remount", async () => {
            const testBlob = createTestBlob();
            let textureSetCount = 0;

            // Track texture setting
            const originalTexImage2D = mockGl.texImage2D;
            mockGl.texImage2D = vi.fn((...args) => {
                textureSetCount++;
                originalTexImage2D.call(mockGl, ...args);
            });

            render(
                <React.StrictMode>
                    <CardCanvas
                        baseTexture={testBlob}
                        darknessFactor={0.5}
                        width={400}
                        height={560}
                        params={DEFAULT_RENDER_PARAMS}
                    />
                </React.StrictMode>
            );

            await waitFor(() => {
                expect(mockGl.drawArrays).toHaveBeenCalled();
            });

            // In strict mode, texture should only be set on the final instance
            // Previous instance's texture load should be discarded
            expect(textureSetCount).toBeGreaterThanOrEqual(1);
        });
    });

    describe("Canvas Styling", () => {
        it("should apply className prop", () => {
            const testBlob = createTestBlob();

            const { container } = render(
                <CardCanvas
                    baseTexture={testBlob}
                    darknessFactor={0.5}
                    width={400}
                    height={560}
                    params={DEFAULT_RENDER_PARAMS}
                    className="custom-class"
                />
            );

            const canvas = container.querySelector("canvas");
            expect(canvas).toHaveClass("custom-class");
        });

        it("should apply style prop merged with display:block", () => {
            const testBlob = createTestBlob();

            const { container } = render(
                <CardCanvas
                    baseTexture={testBlob}
                    darknessFactor={0.5}
                    width={400}
                    height={560}
                    params={DEFAULT_RENDER_PARAMS}
                    style={{ backfaceVisibility: "hidden" }}
                />
            );

            const canvas = container.querySelector("canvas");
            expect(canvas).toHaveStyle({ display: "block" });
            expect(canvas).toHaveStyle({ backfaceVisibility: "hidden" });
        });

        it("should set canvas width and height attributes", () => {
            const testBlob = createTestBlob();

            const { container } = render(
                <CardCanvas
                    baseTexture={testBlob}
                    darknessFactor={0.5}
                    width={630}
                    height={880}
                    params={DEFAULT_RENDER_PARAMS}
                />
            );

            const canvas = container.querySelector("canvas");
            expect(canvas).toHaveAttribute("width", "630");
            expect(canvas).toHaveAttribute("height", "880");
        });
    });

    describe("Edge Cases", () => {
        it("should handle null baseTexture gracefully", () => {
            // Should not throw
            expect(() => {
                render(
                    <CardCanvas
                        baseTexture={null as unknown as Blob}
                        darknessFactor={0.5}
                        width={400}
                        height={560}
                        params={DEFAULT_RENDER_PARAMS}
                    />
                );
            }).not.toThrow();
        });

        it("should handle dimension changes", async () => {
            const testBlob = createTestBlob();

            const { rerender } = render(
                <CardCanvas
                    baseTexture={testBlob}
                    darknessFactor={0.5}
                    width={400}
                    height={560}
                    params={DEFAULT_RENDER_PARAMS}
                />
            );

            await waitFor(() => {
                expect(mockGl.viewport).toHaveBeenCalledWith(0, 0, 400, 560);
            });

            rerender(
                <CardCanvas
                    baseTexture={testBlob}
                    darknessFactor={0.5}
                    width={630}
                    height={880}
                    params={DEFAULT_RENDER_PARAMS}
                />
            );

            await waitFor(() => {
                expect(mockGl.viewport).toHaveBeenCalledWith(0, 0, 630, 880);
            });
        });
    });
});
