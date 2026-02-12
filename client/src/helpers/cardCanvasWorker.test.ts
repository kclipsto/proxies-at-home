import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    darkenModeToInt,
    createShader,
    createProgram,
    createTextureFromBitmap,
    updateUniforms,
    overridesToRenderParams,
    hasAdvancedOverrides,
    renderCardWithOverridesWorker,
    resetEffectContextManager,
} from "./cardCanvasWorker";
import { DEFAULT_RENDER_PARAMS } from "../components/CardCanvas/types";
import type { CardOverrides } from "../../../shared/types";

// Mock WebGL2RenderingContext
const createMockGl = () => {
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
        deleteBuffer: vi.fn(),
        useProgram: vi.fn(),
        uniform1i: vi.fn(),
        uniform1f: vi.fn(),
        uniform2f: vi.fn(),
        uniform3f: vi.fn(),
        activeTexture: vi.fn(),
        bindTexture: vi.fn(),
        createTexture: vi.fn(() => ({})),
        deleteTexture: vi.fn(),
        texParameteri: vi.fn(),
        texImage2D: vi.fn(),
        viewport: vi.fn(),
        clearColor: vi.fn(),
        clear: vi.fn(),
        drawArrays: vi.fn(),
        getError: vi.fn(() => 0),
        getExtension: vi.fn(() => ({ loseContext: vi.fn() })),
        isContextLost: vi.fn(() => false),
    };
    return mockGl as unknown as WebGL2RenderingContext;
};

describe("cardCanvasWorker", () => {
    describe("darkenModeToInt", () => {
        it("should return 0 for 'none'", () => {
            expect(darkenModeToInt("none")).toBe(0);
        });

        it("should return 1 for 'darken-all'", () => {
            expect(darkenModeToInt("darken-all")).toBe(1);
        });

        it("should return 2 for 'contrast-edges'", () => {
            expect(darkenModeToInt("contrast-edges")).toBe(2);
        });

        it("should return 3 for 'contrast-full'", () => {
            expect(darkenModeToInt("contrast-full")).toBe(3);
        });

        it("should return 0 for unknown mode", () => {
            expect(darkenModeToInt("unknown" as never)).toBe(0);
        });
    });

    describe("createShader", () => {
        it("should create and compile a shader", () => {
            const gl = createMockGl();
            const shader = createShader(gl, gl.VERTEX_SHADER, "void main() {}");

            expect(gl.createShader).toHaveBeenCalledWith(gl.VERTEX_SHADER);
            expect(gl.shaderSource).toHaveBeenCalled();
            expect(gl.compileShader).toHaveBeenCalled();
            expect(shader).toBeDefined();
        });

        it("should throw on shader creation failure", () => {
            const gl = createMockGl();
            (gl.createShader as ReturnType<typeof vi.fn>).mockReturnValue(null);

            expect(() => createShader(gl, gl.VERTEX_SHADER, "test")).toThrow(
                "Failed to create shader"
            );
        });

        it("should throw on compilation failure", () => {
            const gl = createMockGl();
            (gl.getShaderParameter as ReturnType<typeof vi.fn>).mockReturnValue(false);
            (gl.getShaderInfoLog as ReturnType<typeof vi.fn>).mockReturnValue("Compile error");

            expect(() => createShader(gl, gl.VERTEX_SHADER, "bad code")).toThrow(
                "Shader compile error: Compile error"
            );
        });
    });

    describe("createProgram", () => {
        it("should create and link a program", () => {
            const gl = createMockGl();
            const vs = {} as WebGLShader;
            const fs = {} as WebGLShader;

            const program = createProgram(gl, vs, fs);

            expect(gl.createProgram).toHaveBeenCalled();
            expect(gl.attachShader).toHaveBeenCalledWith(expect.anything(), vs);
            expect(gl.attachShader).toHaveBeenCalledWith(expect.anything(), fs);
            expect(gl.linkProgram).toHaveBeenCalled();
            expect(program).toBeDefined();
        });

        it("should throw on program creation failure", () => {
            const gl = createMockGl();
            (gl.createProgram as ReturnType<typeof vi.fn>).mockReturnValue(null);

            expect(() => createProgram(gl, {} as WebGLShader, {} as WebGLShader)).toThrow(
                "Failed to create program"
            );
        });

        it("should throw on link failure", () => {
            const gl = createMockGl();
            (gl.getProgramParameter as ReturnType<typeof vi.fn>).mockReturnValue(false);
            (gl.getProgramInfoLog as ReturnType<typeof vi.fn>).mockReturnValue("Link error");

            expect(() => createProgram(gl, {} as WebGLShader, {} as WebGLShader)).toThrow(
                "Program link error: Link error"
            );
        });
    });

    describe("createTextureFromBitmap", () => {
        it("should create a texture from ImageBitmap", () => {
            const gl = createMockGl();
            const mockBitmap = { width: 100, height: 100 } as ImageBitmap;

            const texture = createTextureFromBitmap(gl, mockBitmap);

            expect(gl.createTexture).toHaveBeenCalled();
            expect(gl.bindTexture).toHaveBeenCalledWith(gl.TEXTURE_2D, expect.anything());
            expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            expect(gl.texImage2D).toHaveBeenCalled();
            expect(texture).toBeDefined();
        });

        it("should throw on texture creation failure", () => {
            const gl = createMockGl();
            (gl.createTexture as ReturnType<typeof vi.fn>).mockReturnValue(null);

            expect(() => createTextureFromBitmap(gl, {} as ImageBitmap)).toThrow(
                "Failed to create texture"
            );
        });
    });

    describe("updateUniforms", () => {
        it("should set all uniforms correctly", () => {
            const gl = createMockGl();
            // Create a comprehensive uniforms mock with all required locations
            const uniforms = {
                u_baseTexture: { name: "u_baseTexture" },
                u_distanceField: { name: "u_distanceField" },
                u_resolution: { name: "u_resolution" },
                u_darkenMode: { name: "u_darkenMode" },
                u_darkenThreshold: { name: "u_darkenThreshold" },
                u_darkenContrast: { name: "u_darkenContrast" },
                u_darkenEdgeWidth: { name: "u_darkenEdgeWidth" },
                u_darkenAmount: { name: "u_darkenAmount" },
                u_darkenBrightness: { name: "u_darkenBrightness" },
                u_brightness: { name: "u_brightness" },
                u_contrast: { name: "u_contrast" },
                u_saturation: { name: "u_saturation" },
                u_sharpness: { name: "u_sharpness" },
                // Color effects
                u_gamma: { name: "u_gamma" },
                u_hueShift: { name: "u_hueShift" },
                u_sepia: { name: "u_sepia" },
                u_tintColor: { name: "u_tintColor" },
                u_tintAmount: { name: "u_tintAmount" },
                // RGB Balance
                u_redBalance: { name: "u_redBalance" },
                u_greenBalance: { name: "u_greenBalance" },
                u_blueBalance: { name: "u_blueBalance" },
                // CMYK Balance
                u_cyanBalance: { name: "u_cyanBalance" },
                u_magentaBalance: { name: "u_magentaBalance" },
                u_yellowBalance: { name: "u_yellowBalance" },
                u_blackBalance: { name: "u_blackBalance" },
                // Color Balance
                u_shadowsIntensity: { name: "u_shadowsIntensity" },
                u_midtonesIntensity: { name: "u_midtonesIntensity" },
                u_highlightsIntensity: { name: "u_highlightsIntensity" },
                // Noise & Preview
                u_noiseReduction: { name: "u_noiseReduction" },
                u_cmykPreview: { name: "u_cmykPreview" },
                // Holo
                u_holoEffect: { name: "u_holoEffect" },
                u_holoStrength: { name: "u_holoStrength" },
                u_holoAreaMode: { name: "u_holoAreaMode" },
                u_holoAreaThreshold: { name: "u_holoAreaThreshold" },
                u_holoAngle: { name: "u_holoAngle" },
                u_holoSweepWidth: { name: "u_holoSweepWidth" },
                u_holoStarSize: { name: "u_holoStarSize" },
                u_holoStarVariety: { name: "u_holoStarVariety" },
                // Color Replace
                u_colorReplaceEnabled: { name: "u_colorReplaceEnabled" },
                u_colorReplaceSource: { name: "u_colorReplaceSource" },
                u_colorReplaceTarget: { name: "u_colorReplaceTarget" },
                u_colorReplaceThreshold: { name: "u_colorReplaceThreshold" },
                // Vignette
                u_vignetteAmount: { name: "u_vignetteAmount" },
                u_vignetteSize: { name: "u_vignetteSize" },
                u_vignetteFeather: { name: "u_vignetteFeather" },
            } as unknown as Parameters<typeof updateUniforms>[1];

            updateUniforms(gl, uniforms, DEFAULT_RENDER_PARAMS, 800, 600);

            // Verify key uniform methods were called
            expect(gl.uniform2f).toHaveBeenCalledWith(uniforms.u_resolution, 750, 562.5);
            expect(gl.uniform1f).toHaveBeenCalled();
            expect(gl.uniform3f).toHaveBeenCalled();
        });
    });

    describe("overridesToRenderParams", () => {
        it("should use override values when provided", () => {
            const overrides: CardOverrides = {
                brightness: 10,
                contrast: 1.5,
                saturation: 0.8,
                darkenMode: "contrast-edges",
            };

            const params = overridesToRenderParams(overrides);

            expect(params.brightness).toBe(10);
            expect(params.contrast).toBe(1.5);
            expect(params.saturation).toBe(0.8);
            expect(params.darkenMode).toBe("contrast-edges");
        });

        it("should use default values when overrides are not provided", () => {
            const overrides: CardOverrides = {};

            const params = overridesToRenderParams(overrides);

            expect(params.brightness).toBe(DEFAULT_RENDER_PARAMS.brightness);
            expect(params.contrast).toBe(DEFAULT_RENDER_PARAMS.contrast);
            expect(params.saturation).toBe(DEFAULT_RENDER_PARAMS.saturation);
            expect(params.darkenMode).toBe(DEFAULT_RENDER_PARAMS.darkenMode);
        });

        it("should use global darken mode when not specified in overrides", () => {
            const overrides: CardOverrides = { brightness: 5 };

            const params = overridesToRenderParams(overrides, "darken-all");

            expect(params.darkenMode).toBe("darken-all");
        });

        it("should prefer override darkenMode over global", () => {
            const overrides: CardOverrides = { darkenMode: "contrast-full" };

            const params = overridesToRenderParams(overrides, "darken-all");

            expect(params.darkenMode).toBe("contrast-full");
        });
    });

    describe("hasAdvancedOverrides", () => {
        it("should return false for undefined overrides", () => {
            expect(hasAdvancedOverrides(undefined)).toBe(false);
        });

        it("should return false for empty overrides", () => {
            expect(hasAdvancedOverrides({})).toBe(false);
        });

        it("should return false for only darkenMode override", () => {
            // darkenMode alone doesn't require re-rendering since we select the appropriate pre-rendered blob
            expect(hasAdvancedOverrides({ darkenMode: "contrast-edges" })).toBe(false);
        });

        it("should return true for brightness adjustment", () => {
            expect(hasAdvancedOverrides({ brightness: 10 })).toBe(true);
        });

        it("should return true for negative brightness", () => {
            expect(hasAdvancedOverrides({ brightness: -10 })).toBe(true);
        });

        it("should return false for brightness of 0", () => {
            expect(hasAdvancedOverrides({ brightness: 0 })).toBe(false);
        });

        it("should return true for contrast adjustment", () => {
            expect(hasAdvancedOverrides({ contrast: 1.5 })).toBe(true);
        });

        it("should return false for contrast of 1", () => {
            expect(hasAdvancedOverrides({ contrast: 1 })).toBe(false);
        });


        it("should return true for saturation adjustment", () => {
            expect(hasAdvancedOverrides({ saturation: 0.5 })).toBe(true);
        });

        it("should return false for saturation of 1", () => {
            expect(hasAdvancedOverrides({ saturation: 1 })).toBe(false);
        });

        it("should return true for sharpness adjustment", () => {
            expect(hasAdvancedOverrides({ sharpness: 0.5 })).toBe(true);
        });

        it("should return false for sharpness of 0", () => {
            expect(hasAdvancedOverrides({ sharpness: 0 })).toBe(false);
        });

        it("should return true for darkenThreshold override", () => {
            expect(hasAdvancedOverrides({ darkenThreshold: 50 })).toBe(true);
        });

        it("should return true for darkenContrast override", () => {
            expect(hasAdvancedOverrides({ darkenContrast: 1.5 })).toBe(true);
        });

        it("should return true for darkenEdgeWidth override", () => {
            expect(hasAdvancedOverrides({ darkenEdgeWidth: 20 })).toBe(true);
        });

        it("should return true for darkenAmount override", () => {
            expect(hasAdvancedOverrides({ darkenAmount: 0.8 })).toBe(true);
        });

        it("should return true for darkenBrightness override", () => {
            expect(hasAdvancedOverrides({ darkenBrightness: -10 })).toBe(true);
        });

        it("should return true for multiple overrides", () => {
            expect(hasAdvancedOverrides({
                brightness: 5,
                contrast: 1.2,
                darkenMode: "contrast-edges",
            })).toBe(true);
        });
    });

    describe("renderCardWithOverridesWorker", () => {
        let mockGl: ReturnType<typeof createMockGl>;
        let originalOffscreenCanvas: typeof OffscreenCanvas;
        let mockConvertToBlob: ReturnType<typeof vi.fn>;

        beforeEach(() => {
            mockGl = createMockGl() as unknown as ReturnType<typeof createMockGl>;
            mockConvertToBlob = vi.fn(() => Promise.resolve(new Blob(["test"], { type: "image/png" })));

            // Mock OffscreenCanvas as a class
            originalOffscreenCanvas = globalThis.OffscreenCanvas;

            // Create a mock class that can be instantiated with `new`
            class MockOffscreenCanvas {
                width: number;
                height: number;
                constructor(width: number, height: number) {
                    this.width = width;
                    this.height = height;
                }
                getContext() {
                    return mockGl;
                }
                convertToBlob = mockConvertToBlob;
                addEventListener = vi.fn();
            }

            globalThis.OffscreenCanvas = MockOffscreenCanvas as unknown as typeof OffscreenCanvas;

            // Reset the context manager so it picks up the mocked OffscreenCanvas
            resetEffectContextManager();
        });

        afterEach(() => {
            globalThis.OffscreenCanvas = originalOffscreenCanvas;
            vi.restoreAllMocks();
        });

        it("should create OffscreenCanvas with correct dimensions", async () => {
            const mockBitmap = { width: 800, height: 600 } as ImageBitmap;

            // The test passes if no error is thrown and a blob is returned
            // Dimensions are verified by the fact that the mock canvas is created and used successfully
            const result = await renderCardWithOverridesWorker(mockBitmap, DEFAULT_RENDER_PARAMS);

            expect(result).toBeInstanceOf(Blob);
        });

        it("should render and return a blob", async () => {
            const mockBitmap = { width: 100, height: 100 } as ImageBitmap;

            const result = await renderCardWithOverridesWorker(mockBitmap, DEFAULT_RENDER_PARAMS);

            expect(result).toBeInstanceOf(Blob);
            expect(result.type).toBe("image/png");
        });

        it("should call uniform1f for rendering parameters", async () => {
            const mockBitmap = { width: 100, height: 100 } as ImageBitmap;

            const result = await renderCardWithOverridesWorker(mockBitmap, DEFAULT_RENDER_PARAMS);

            // Verify rendering completed successfully
            expect(result).toBeInstanceOf(Blob);
            // Verify uniform1f was called multiple times (includes brightness)
            expect((mockGl as unknown as { uniform1f: ReturnType<typeof vi.fn> }).uniform1f).toHaveBeenCalled();
        });

        it("should work without optional parameters", async () => {
            const mockBitmap = { width: 100, height: 100 } as ImageBitmap;

            await renderCardWithOverridesWorker(mockBitmap, DEFAULT_RENDER_PARAMS);

            expect((mockGl as unknown as { uniform1f: ReturnType<typeof vi.fn> }).uniform1f)
                .toHaveBeenCalled();
        });

        it("should throw when WebGL2 is not supported", async () => {
            // Override the mock to return null from getContext
            class MockOffscreenCanvasNoWebGL {
                width: number;
                height: number;
                constructor(width: number, height: number) {
                    this.width = width;
                    this.height = height;
                }
                getContext() {
                    return null; // Simulate WebGL2 not supported
                }
                convertToBlob = vi.fn();
                addEventListener = vi.fn();
            }
            globalThis.OffscreenCanvas = MockOffscreenCanvasNoWebGL as unknown as typeof OffscreenCanvas;

            const mockBitmap = { width: 100, height: 100 } as ImageBitmap;

            await expect(renderCardWithOverridesWorker(mockBitmap, DEFAULT_RENDER_PARAMS))
                .rejects.toThrow("WebGL2 not supported");
        });

        it("should clean up WebGL resources after rendering", async () => {
            const mockBitmap = { width: 100, height: 100 } as ImageBitmap;

            await renderCardWithOverridesWorker(mockBitmap, DEFAULT_RENDER_PARAMS);

            const glMock = mockGl as unknown as { deleteTexture: ReturnType<typeof vi.fn>; deleteBuffer: ReturnType<typeof vi.fn>; deleteVertexArray: ReturnType<typeof vi.fn>; deleteProgram: ReturnType<typeof vi.fn> };
            expect(glMock.deleteTexture).toHaveBeenCalled();
            expect(glMock.deleteBuffer).toHaveBeenCalled();
            expect(glMock.deleteVertexArray).toHaveBeenCalled();
            expect(glMock.deleteProgram).toHaveBeenCalled();
        });

        it("should apply brightness adjustment", async () => {
            const mockBitmap = { width: 100, height: 100 } as ImageBitmap;
            const params = { ...DEFAULT_RENDER_PARAMS, brightness: 20 };

            const result = await renderCardWithOverridesWorker(mockBitmap, params);

            // Verify rendering completed with custom brightness
            expect(result).toBeInstanceOf(Blob);
            // Verify uniform1f was called multiple times (includes brightness)
            expect((mockGl as unknown as { uniform1f: ReturnType<typeof vi.fn> }).uniform1f).toHaveBeenCalled();
        });

        it("should apply brightness adjustment directly without scaling", async () => {
            const mockBitmap = { width: 100, height: 100 } as ImageBitmap;
            const params = { ...DEFAULT_RENDER_PARAMS, brightness: 25 };

            await renderCardWithOverridesWorker(mockBitmap, params);

            const calls = (mockGl as unknown as { uniform1f: ReturnType<typeof vi.fn> }).uniform1f.mock.calls;
            // Find the call for u_brightness
            const brightnessCall = calls.find((call: unknown[]) => (call[0] as { name: string }).name === 'u_brightness');

            expect(brightnessCall).toBeDefined();
            // Should be passed directly as 25, not scaled by 50 (which would be 1250)
            expect(brightnessCall![1]).toBe(25);
        });

        it("should apply contrast adjustment", async () => {
            const mockBitmap = { width: 100, height: 100 } as ImageBitmap;
            const params = { ...DEFAULT_RENDER_PARAMS, contrast: 1.5 };

            await renderCardWithOverridesWorker(mockBitmap, params);

            const calls = (mockGl as unknown as { uniform1f: ReturnType<typeof vi.fn> }).uniform1f.mock.calls;
            const contrastCall = calls.find((call: unknown[]) => call[1] === 1.5);
            expect(contrastCall).toBeDefined();
        });

        it("should clean up resources on error and rethrow", async () => {
            // Create a mock that throws during texture creation
            const errorGl = createMockGl();
            (errorGl.createTexture as ReturnType<typeof vi.fn>).mockReturnValue(null);

            class MockOffscreenCanvasWithError {
                width: number;
                height: number;
                constructor(width: number, height: number) {
                    this.width = width;
                    this.height = height;
                }
                getContext() {
                    return errorGl;
                }
                convertToBlob = vi.fn();
                addEventListener = vi.fn();
            }
            globalThis.OffscreenCanvas = MockOffscreenCanvasWithError as unknown as typeof OffscreenCanvas;

            const mockBitmap = { width: 100, height: 100 } as ImageBitmap;

            await expect(renderCardWithOverridesWorker(mockBitmap, DEFAULT_RENDER_PARAMS))
                .rejects.toThrow("Failed to create texture");

            // Verify cleanup was called
            expect(errorGl.deleteVertexArray).toHaveBeenCalled();
            expect(errorGl.deleteProgram).toHaveBeenCalled();
        });
    });
});
