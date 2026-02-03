import {
    IN,
    getBleedInPixels,
    computeDarknessFactorFromPixels,
} from "./imageProcessing";
import {
    createShader,
    createProgram,
    createTexture,
    createFramebuffer,
    createQuadBuffer,
} from "./webgl/webglUtils";
import { VS_QUAD, FS_INIT, FS_STEP, FS_FINAL, FS_DIRECT } from "./webgl/shaders";
import type { DarkenMode } from "../store/settings";
import { darkenModeToInt } from "../components/CardCanvas/types";
import { debugLog } from "./debug";

// WebGL Debug Logging
const WEBGL_DEBUG = true;
let webglContextCount = 0;
let webglContextsCreated = 0;

function webglLog(message: string, ...args: unknown[]) {
    if (WEBGL_DEBUG) {
        debugLog(`[WebGL] ${message}`, ...args);
    }
}

function trackContextCreation(source: string): number {
    webglContextCount++;
    webglContextsCreated++;
    const id = webglContextsCreated;
    webglLog(`Context CREATED #${id} by ${source} (active: ${webglContextCount})`);
    return id;
}

function trackContextRelease(id: number, source: string) {
    webglContextCount--;
    webglLog(`Context RELEASED #${id} by ${source} (active: ${webglContextCount})`);
}

/**
 * Persistent WebGL context manager.
 * Maintains a single context per "purpose" (export/display) that is reused across renders.
 * Only creates a new context on first use or if the previous one was lost.
 */
class WebGLContextManager {
    private canvas: OffscreenCanvas | null = null;
    private gl: WebGL2RenderingContext | null = null;
    private isContextLost = false;
    private contextId = 0;
    private readonly purpose: string;

    constructor(purpose: string) {
        this.purpose = purpose;
    }

    /**
     * Get or create a WebGL context at the specified size.
     * Reuses existing context if available and not lost.
     */
    getContext(width: number, height: number): { canvas: OffscreenCanvas; gl: WebGL2RenderingContext; isNew: boolean } {
        // Check if existing context is still valid (not lost by browser)
        if (this.canvas && this.gl && !this.isContextLost) {
            // Additional check: verify context wasn't silently lost by the browser
            if (this.gl.isContextLost()) {
                webglLog(`Context for ${this.purpose} was silently lost, recreating...`);
                this.isContextLost = true;
            } else {
                // Context is valid, resize if needed
                if (this.canvas.width !== width || this.canvas.height !== height) {
                    this.canvas.width = width;
                    this.canvas.height = height;
                    this.gl.viewport(0, 0, width, height);
                }
                return { canvas: this.canvas, gl: this.gl, isNew: false };
            }
        }

        // Need to create new context
        this.canvas = new OffscreenCanvas(width, height);
        this.gl = this.canvas.getContext("webgl2", {
            premultipliedAlpha: false,
            preserveDrawingBuffer: true,
            antialias: false,
        });

        if (!this.gl) {
            throw new Error("WebGL2 not supported");
        }

        // Set up context loss handler
        this.canvas.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            webglLog(`Context lost event for ${this.purpose}`);
            this.isContextLost = true;
        });

        this.isContextLost = false;
        this.contextId = trackContextCreation(this.purpose);
        webglLog(`Context manager created new context for ${this.purpose}: ${width}x${height}`);

        return { canvas: this.canvas, gl: this.gl, isNew: true };
    }

    /**
     * Mark the context as lost. Next getContext() will create a new one.
     */
    handleContextLost() {
        if (this.contextId > 0) {
            trackContextRelease(this.contextId, this.purpose);
        }
        this.isContextLost = true;
        this.gl = null;
        this.canvas = null;
        webglLog(`Context lost for ${this.purpose}`);
    }

    /**
     * Explicitly release the context. Use only when done with all processing.
     */
    release() {
        if (this.gl && !this.isContextLost) {
            this.gl.getExtension("WEBGL_lose_context")?.loseContext();
            trackContextRelease(this.contextId, this.purpose);
        }
        this.gl = null;
        this.canvas = null;
        this.isContextLost = false;
        this.contextId = 0;
    }
}

// Module-level context managers - reused across all renders in this worker
const exportContextManager = new WebGLContextManager('export');
const displayContextManager = new WebGLContextManager('display');
const jfaContextManager = new WebGLContextManager('jfa');
const bleedGenContextManager = new WebGLContextManager('bleed-gen');

/**
 * Compute the darknessFactor from an ImageBitmap by building a luminance histogram.
 * Returns a value 0-1 where:
 * - 0 = very dark image (10th percentile luminance near 90)
 * - 1 = light image (10th percentile luminance near 20 or below)
 * 
 * This is used for adaptive edge contrast - darker images get less aggressive
 * darkening to avoid crushing details.
 */
// Cache for darkness factor computation to avoid re-analyzing the same ImageBitmap
const darknessFactorCache = new WeakMap<ImageBitmap, number>();

function computeDarknessFactor(img: ImageBitmap): number {
    if (darknessFactorCache.has(img)) {
        return darknessFactorCache.get(img)!;
    }
    // Create a small canvas to sample the image (we don't need full resolution)
    const sampleSize = 256; // Sample at max 256x256 for performance
    const scale = Math.min(1, sampleSize / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);

    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        // Fallback to neutral darkness factor if context unavailable
        return 0.5;
    }
    ctx.drawImage(img, 0, 0, w, h);

    const imageData = ctx.getImageData(0, 0, w, h);

    // Use shared utility for histogram calculation
    const factor = computeDarknessFactorFromPixels(imageData.data);
    darknessFactorCache.set(img, factor);
    return factor;
}

/**
 * WebGL programs for JFA-based bleed generation
 */
export interface WebGLPrograms {
    init: WebGLProgram;
    step: WebGLProgram;
    final: WebGLProgram;
}

/**
 * Initialize WebGL programs for bleed generation using Jump Flood Algorithm
 */
function initWebGLPrograms(gl: WebGL2RenderingContext): WebGLPrograms {
    const vs = createShader(gl, gl.VERTEX_SHADER, VS_QUAD);
    const fsInit = createShader(gl, gl.FRAGMENT_SHADER, FS_INIT);
    const fsStep = createShader(gl, gl.FRAGMENT_SHADER, FS_STEP);
    const fsFinal = createShader(gl, gl.FRAGMENT_SHADER, FS_FINAL);

    const progInit = createProgram(gl, vs, fsInit);
    const progStep = createProgram(gl, vs, fsStep);
    const progFinal = createProgram(gl, vs, fsFinal);

    // Clean up shaders as they are linked now
    gl.deleteShader(vs);
    gl.deleteShader(fsInit);
    gl.deleteShader(fsStep);
    gl.deleteShader(fsFinal);

    return {
        init: progInit,
        step: progStep,
        final: progFinal,
    };
}

/**
 * Run Jump Flood Algorithm steps to propagate seed coordinates.
 * Returns the texture containing the final seed map.
 */
function runJfaSteps(
    gl: WebGL2RenderingContext,
    stepProgram: WebGLProgram,
    texA: WebGLTexture,
    texB: WebGLTexture,
    fbA: WebGLFramebuffer,
    fbB: WebGLFramebuffer,
    width: number,
    height: number
): WebGLTexture {
    gl.useProgram(stepProgram);
    gl.uniform2f(gl.getUniformLocation(stepProgram, "u_resolution"), width, height);
    const uStepLoc = gl.getUniformLocation(stepProgram, "u_step");
    const uSeedsLoc = gl.getUniformLocation(stepProgram, "u_seeds");

    let currentFb = fbA;
    let currentTex = texA;
    let nextFb = fbB;
    let nextTex = texB;

    const maxDim = Math.max(width, height);
    const steps = Math.ceil(Math.log2(maxDim));

    for (let i = steps - 1; i >= 0; i--) {
        const stepSize = Math.pow(2, i);

        gl.bindFramebuffer(gl.FRAMEBUFFER, nextFb);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, currentTex);
        gl.uniform1i(uSeedsLoc, 0);
        gl.uniform1f(uStepLoc, stepSize);

        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Swap
        const tempFb = currentFb;
        currentFb = nextFb;
        nextFb = tempFb;

        const tempTex = currentTex;
        currentTex = nextTex;
        nextTex = tempTex;
    }

    return currentTex;
}

/**
 * Calculate image placement for aspect-ratio-preserving fit
 */
function calculateImagePlacement(
    img: ImageBitmap,
    targetWidth: number,
    targetHeight: number
): {
    drawWidth: number;
    drawHeight: number;
    offsetX: number;
    offsetY: number;
} {
    const aspectRatio = img.width / img.height;
    const targetAspect = targetWidth / targetHeight;

    let drawWidth = targetWidth;
    let drawHeight = targetHeight;
    let offsetX = 0;
    let offsetY = 0;

    if (aspectRatio > targetAspect) {
        drawHeight = targetHeight;
        drawWidth = img.width * (targetHeight / img.height);
        offsetX = (drawWidth - targetWidth) / 2;
    } else {
        drawWidth = targetWidth;
        drawHeight = img.height * (targetWidth / img.width);
        offsetY = (drawHeight - targetHeight) / 2;
    }

    return { drawWidth, drawHeight, offsetX, offsetY };
}

/**
 * Generate a bleed canvas using WebGL-accelerated JFA
 */
export async function generateBleedCanvasWebGL(
    img: ImageBitmap,
    bleedWidth: number,
    opts: { unit?: "mm" | "in"; dpi?: number; inputBleed?: number; darkenMode?: DarkenMode; darkenThreshold?: number; darkenContrast?: number; darkenEdgeWidth?: number; darkenAmount?: number; darkenBrightness?: number; darkenAutoDetect?: boolean }
): Promise<OffscreenCanvas> {
    const dpi = opts?.dpi ?? 300;
    const targetCardWidth = IN(2.48, dpi);
    const targetCardHeight = IN(3.47, dpi);
    const bleed = Math.round(getBleedInPixels(bleedWidth, opts?.unit ?? "mm", dpi));

    const finalWidth = Math.ceil(targetCardWidth + bleed * 2);
    const finalHeight = Math.ceil(targetCardHeight + bleed * 2);

    // Get or create WebGL context using context manager (reuses if available)
    const { canvas, gl, isNew } = bleedGenContextManager.getContext(finalWidth, finalHeight);

    webglLog(`Bleed generation: ${finalWidth}x${finalHeight}, bleed=${bleedWidth}${opts?.unit ?? 'mm'}, reused=${!isNew}`);

    // Initialize WebGL resources for this context
    const progs = initWebGLPrograms(gl);
    const quadBuffer = createQuadBuffer(gl);

    // Calculate image placement
    // Calculate image placement
    // If input has bleed, we scale based on CONTENT size, not full image size
    const inputBleedMm = opts?.inputBleed ?? 0;
    const inputBleedPx = Math.round(getBleedInPixels(inputBleedMm, opts?.unit ?? "mm", dpi));

    let drawWidth: number, drawHeight: number, offsetX: number, offsetY: number;

    if (inputBleedMm > 0) {
        // Calculate scale factor relative to target content size
        const inputContentWidth = img.width - inputBleedPx * 2;
        const inputContentHeight = img.height - inputBleedPx * 2;

        // Scale to fit width (keeping aspect ratio)
        const scale = targetCardWidth / inputContentWidth;

        drawWidth = img.width * scale;
        drawHeight = img.height * scale;

        // Center the input content relative to the target content area
        const targetContentCenterX = targetCardWidth / 2;
        const targetContentCenterY = targetCardHeight / 2;

        // Calculate center of the content portion within the scaled input image
        const inputContentCenterX = (inputContentWidth / 2 + inputBleedPx) * scale;
        const inputContentCenterY = (inputContentHeight / 2 + inputBleedPx) * scale;

        offsetX = targetContentCenterX - inputContentCenterX;
        offsetY = targetContentCenterY - inputContentCenterY;

    } else {
        const placement = calculateImagePlacement(
            img,
            targetCardWidth,
            targetCardHeight
        );
        drawWidth = placement.drawWidth;
        drawHeight = placement.drawHeight;
        offsetX = placement.offsetX;
        offsetY = placement.offsetY;
    }

    // Calculate scale and source offset for shader coordinate mapping
    const scaleX = drawWidth / img.width;
    const scaleY = drawHeight / img.height;
    const sourceOffsetX = offsetX / scaleX;
    const sourceOffsetY = offsetY / scaleY;

    // Setup Viewport
    gl.viewport(0, 0, finalWidth, finalHeight);

    // 1. Upload Image Texture
    const imgTexture = createTexture(gl, img.width, img.height, img);

    // Use Linear filtering for the image to avoid aliasing/blur artifacts during scaling
    gl.bindTexture(gl.TEXTURE_2D, imgTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // 2. Create Ping-Pong Textures for JFA
    // We need float textures for coordinates
    // EXT_color_buffer_float is needed for rendering to float textures
    gl.getExtension("EXT_color_buffer_float");

    const texA = createTexture(gl, finalWidth, finalHeight, null, gl.RG32F, gl.RG, gl.FLOAT);
    const texB = createTexture(gl, finalWidth, finalHeight, null, gl.RG32F, gl.RG, gl.FLOAT);

    const fbA = createFramebuffer(gl, texA);
    const fbB = createFramebuffer(gl, texB);

    // Common attribute setup
    const aPositionLoc = 0; // Layout location 0 in shader
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(aPositionLoc);
    gl.vertexAttribPointer(aPositionLoc, 2, gl.FLOAT, false, 0, 0);

    // --- PASS 1: INIT ---
    gl.useProgram(progs.init);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbA);
    gl.clearColor(-1, -1, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Uniforms
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, imgTexture);
    gl.uniform1i(gl.getUniformLocation(progs.init, "u_image"), 0);
    gl.uniform2f(gl.getUniformLocation(progs.init, "u_resolution"), finalWidth, finalHeight);
    gl.uniform2f(gl.getUniformLocation(progs.init, "u_imageSize"), targetCardWidth, targetCardHeight);
    gl.uniform2f(gl.getUniformLocation(progs.init, "u_offset"), bleed, bleed);
    gl.uniform2f(gl.getUniformLocation(progs.init, "u_srcImageSize"), img.width, img.height);
    gl.uniform2f(gl.getUniformLocation(progs.init, "u_srcOffset"), sourceOffsetX, sourceOffsetY);
    gl.uniform2f(gl.getUniformLocation(progs.init, "u_scale"), scaleX, scaleY);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // --- PASS 2: JFA STEPS ---
    const finalSeedTex = runJfaSteps(gl, progs.step, texA, texB, fbA, fbB, finalWidth, finalHeight);

    // --- PASS 3: FINAL ---
    // Render to screen (null framebuffer)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(progs.final);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, finalSeedTex); // The final seed map
    gl.uniform1i(gl.getUniformLocation(progs.final, "u_seeds"), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, imgTexture);
    gl.uniform1i(gl.getUniformLocation(progs.final, "u_image"), 1);

    // Compute darknessFactor for adaptive edge contrast
    const darkenModeInt = darkenModeToInt(opts.darkenMode || 'none');
    const darknessFactor = darkenModeInt > 0 ? computeDarknessFactor(img) : 0.5;

    gl.uniform2f(gl.getUniformLocation(progs.final, "u_resolution"), finalWidth, finalHeight);
    gl.uniform2f(gl.getUniformLocation(progs.final, "u_imageSize"), targetCardWidth, targetCardHeight);
    gl.uniform2f(gl.getUniformLocation(progs.final, "u_offset"), bleed, bleed);
    gl.uniform1i(gl.getUniformLocation(progs.final, "u_darkenMode"), darkenModeInt);
    gl.uniform1f(gl.getUniformLocation(progs.final, "u_darknessFactor"), darknessFactor);
    // Explicitly set darken params using opts
    gl.uniform1f(gl.getUniformLocation(progs.final, "u_darkenThreshold"), opts.darkenThreshold ?? 30);
    gl.uniform1f(gl.getUniformLocation(progs.final, "u_darkenContrast"), opts.darkenContrast ?? 2.0);
    gl.uniform1f(gl.getUniformLocation(progs.final, "u_darkenEdgeWidth"), opts.darkenEdgeWidth ?? 0.1);
    gl.uniform1f(gl.getUniformLocation(progs.final, "u_darkenAmount"), opts.darkenAmount ?? 1.0);
    gl.uniform1f(gl.getUniformLocation(progs.final, "u_darkenBrightness"), opts.darkenBrightness ?? -50);

    gl.uniform2f(gl.getUniformLocation(progs.final, "u_srcImageSize"), img.width, img.height);
    gl.uniform2f(gl.getUniformLocation(progs.final, "u_srcOffset"), sourceOffsetX, sourceOffsetY);
    gl.uniform2f(gl.getUniformLocation(progs.final, "u_scale"), scaleX, scaleY);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Cleanup per-render WebGL resources - keep context alive for next render
    gl.deleteTexture(texA);
    gl.deleteTexture(texB);
    gl.deleteTexture(imgTexture);
    gl.deleteFramebuffer(fbA);
    gl.deleteFramebuffer(fbB);
    gl.deleteProgram(progs.init);
    gl.deleteProgram(progs.step);
    gl.deleteProgram(progs.final);
    gl.deleteBuffer(quadBuffer);
    // Do NOT release context - it will be reused for the next image

    // Copy canvas content to a new canvas before returning
    // This is necessary because the source canvas is reused by the context manager
    const resultCanvas = new OffscreenCanvas(canvas.width, canvas.height);
    const resultCtx = resultCanvas.getContext('2d');
    if (resultCtx) {
        resultCtx.drawImage(canvas, 0, 0);
    }
    return resultCanvas;
}

/**
 * Process a card image to generate all required blobs (export + display, normal + selected darkened)
 * Optimized: Runs JFA once and generates only needed versions with final render passes
 */
export async function processCardImageWebGL(
    img: ImageBitmap,
    bleedWidthMm: number,
    opts?: { unit?: "mm" | "in"; exportDpi?: number; displayDpi?: number; inputHasBleedMm?: number; darkenMode?: number; darkenThreshold?: number; darkenContrast?: number; darkenEdgeWidth?: number; darkenAmount?: number; darkenBrightness?: number; darkenAutoDetect?: boolean }
): Promise<{
    exportBlob: Blob;
    exportDpi: number;
    exportBleedWidth: number;
    displayBlob: Blob;
    displayDpi: number;
    displayBleedWidth: number;
    // Per-mode darkened blobs (only present if that mode was generated)
    exportBlobDarkenAll?: Blob;
    displayBlobDarkenAll?: Blob;
    exportBlobContrastEdges?: Blob;
    displayBlobContrastEdges?: Blob;
    exportBlobContrastFull?: Blob;
    displayBlobContrastFull?: Blob;
    // Legacy (kept for backwards compatibility)
    exportBlobDarkened?: Blob;
    displayBlobDarkened?: Blob;
    // For Card Editor live preview
    baseDisplayBlob: Blob;
    detectedHasBuiltInBleed?: boolean;
    darknessFactor: number;
}> {

    const exportDpi = opts?.exportDpi ?? 300;
    const displayDpi = opts?.displayDpi ?? 300;
    const unit = opts?.unit ?? "mm";
    const inputHasBleedMm = opts?.inputHasBleedMm ?? 0;

    // Convert bleedWidthMm to mm if unit is inches
    const totalBleedMm = unit === 'in' ? bleedWidthMm * 25.4 : bleedWidthMm;

    // The additional bleed we need to generate (beyond what's already in the image)
    const additionalBleedMm = Math.max(0, totalBleedMm - inputHasBleedMm);

    const targetCardWidth = IN(2.48, exportDpi);
    const targetCardHeight = IN(3.47, exportDpi);

    // When input has existing bleed, use actual input dimensions instead of forcing to expected
    // This prevents shrinking when aspect ratios don't exactly match
    let inputWidth: number;
    let inputHeight: number;

    if (inputHasBleedMm > 0) {
        // Use actual input image dimensions - the image already has bleed built in
        inputWidth = img.width;
        inputHeight = img.height;
    } else {
        // No existing bleed - use standard card dimensions
        inputWidth = targetCardWidth;
        inputHeight = targetCardHeight;
    }

    // The additional bleed to generate around the input (in export pixels)
    const additionalBleedPx = Math.round(getBleedInPixels(additionalBleedMm, 'mm', exportDpi));

    // Final output dimensions: input dimensions + additional bleed on each side
    const finalWidth = Math.ceil(inputWidth + additionalBleedPx * 2);
    const finalHeight = Math.ceil(inputHeight + additionalBleedPx * 2);

    // Get or create WebGL context using context manager (reuses if available)
    const { canvas, gl, isNew } = jfaContextManager.getContext(finalWidth, finalHeight);

    webglLog(`JFA processing: ${finalWidth}x${finalHeight}, additionalBleed=${additionalBleedMm}mm, reused=${!isNew}`);



    // Initialize WebGL resources once
    const progs = initWebGLPrograms(gl);
    const quadBuffer = createQuadBuffer(gl);

    // Calculate image placement
    // When input has existing bleed, use actual dimensions (no scaling needed)
    // When input has no bleed, fit to standard card dimensions
    const { drawWidth, drawHeight, offsetX, offsetY } = inputHasBleedMm > 0
        ? { drawWidth: inputWidth, drawHeight: inputHeight, offsetX: 0, offsetY: 0 }
        : calculateImagePlacement(img, inputWidth, inputHeight);

    const scaleX = drawWidth / img.width;
    const scaleY = drawHeight / img.height;
    const sourceOffsetX = offsetX / scaleX;
    const sourceOffsetY = offsetY / scaleY;

    gl.viewport(0, 0, finalWidth, finalHeight);

    // Upload image texture once
    const imgTexture = createTexture(gl, img.width, img.height, img);
    gl.bindTexture(gl.TEXTURE_2D, imgTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Create ping-pong textures for JFA
    gl.getExtension("EXT_color_buffer_float");
    const texA = createTexture(gl, finalWidth, finalHeight, null, gl.RG32F, gl.RG, gl.FLOAT);
    const texB = createTexture(gl, finalWidth, finalHeight, null, gl.RG32F, gl.RG, gl.FLOAT);
    const fbA = createFramebuffer(gl, texA);
    const fbB = createFramebuffer(gl, texB);

    // Common attribute setup
    const aPositionLoc = 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(aPositionLoc);
    gl.vertexAttribPointer(aPositionLoc, 2, gl.FLOAT, false, 0, 0);



    // --- PASS 1: INIT (run once) ---
    gl.useProgram(progs.init);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbA);
    gl.clearColor(-1, -1, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, imgTexture);
    gl.uniform1i(gl.getUniformLocation(progs.init, "u_image"), 0);
    gl.uniform2f(gl.getUniformLocation(progs.init, "u_resolution"), finalWidth, finalHeight);
    gl.uniform2f(gl.getUniformLocation(progs.init, "u_imageSize"), inputWidth, inputHeight);
    gl.uniform2f(gl.getUniformLocation(progs.init, "u_offset"), additionalBleedPx, additionalBleedPx);
    gl.uniform2f(gl.getUniformLocation(progs.init, "u_srcImageSize"), img.width, img.height);
    gl.uniform2f(gl.getUniformLocation(progs.init, "u_srcOffset"), sourceOffsetX, sourceOffsetY);
    gl.uniform2f(gl.getUniformLocation(progs.init, "u_scale"), scaleX, scaleY);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // --- PASS 2: JFA STEPS (run once) ---
    const finalSeedTex = runJfaSteps(gl, progs.step, texA, texB, fbA, fbB, finalWidth, finalHeight);



    // Helper function to render final pass and extract blobs
    async function renderFinalAndExtract(
        glCtx: WebGL2RenderingContext,
        darkenMode: number,
        darknessFactor: number
    ): Promise<{ exportBlob: Blob; displayBlob: Blob; darknessFactor: number }> {
        // Render to screen (null framebuffer)
        glCtx.bindFramebuffer(glCtx.FRAMEBUFFER, null);
        glCtx.useProgram(progs.final);

        glCtx.activeTexture(glCtx.TEXTURE0);
        glCtx.bindTexture(glCtx.TEXTURE_2D, finalSeedTex);
        glCtx.uniform1i(glCtx.getUniformLocation(progs.final, "u_seeds"), 0);

        glCtx.activeTexture(glCtx.TEXTURE1);
        glCtx.bindTexture(glCtx.TEXTURE_2D, imgTexture);
        glCtx.uniform1i(glCtx.getUniformLocation(progs.final, "u_image"), 1);

        glCtx.uniform2f(glCtx.getUniformLocation(progs.final, "u_resolution"), finalWidth, finalHeight);
        glCtx.uniform2f(glCtx.getUniformLocation(progs.final, "u_imageSize"), inputWidth, inputHeight);
        glCtx.uniform2f(glCtx.getUniformLocation(progs.final, "u_offset"), additionalBleedPx, additionalBleedPx);
        glCtx.uniform1i(glCtx.getUniformLocation(progs.final, "u_darkenMode"), darkenMode);
        glCtx.uniform1f(glCtx.getUniformLocation(progs.final, "u_darknessFactor"), darknessFactor);
        // Explicitly set darken params
        glCtx.uniform1f(glCtx.getUniformLocation(progs.final, "u_darkenThreshold"), opts?.darkenThreshold ?? 30);
        glCtx.uniform1f(glCtx.getUniformLocation(progs.final, "u_darkenContrast"), opts?.darkenContrast ?? 2.0);
        glCtx.uniform1f(glCtx.getUniformLocation(progs.final, "u_darkenEdgeWidth"), opts?.darkenEdgeWidth ?? 0.1);
        glCtx.uniform1f(glCtx.getUniformLocation(progs.final, "u_darkenAmount"), opts?.darkenAmount ?? 1.0);
        glCtx.uniform1f(glCtx.getUniformLocation(progs.final, "u_darkenBrightness"), opts?.darkenBrightness ?? -50);

        glCtx.uniform2f(glCtx.getUniformLocation(progs.final, "u_srcImageSize"), img.width, img.height);
        glCtx.uniform2f(glCtx.getUniformLocation(progs.final, "u_srcOffset"), sourceOffsetX, sourceOffsetY);
        glCtx.uniform2f(glCtx.getUniformLocation(progs.final, "u_scale"), scaleX, scaleY);

        glCtx.drawArrays(glCtx.TRIANGLES, 0, 6);

        const exportBlob = await canvas.convertToBlob({ type: "image/png" });

        // Create display version by downscaling
        const displayWidth = (finalWidth / exportDpi) * displayDpi;
        const displayHeight = (finalHeight / exportDpi) * displayDpi;
        const lowResCanvas = new OffscreenCanvas(displayWidth, displayHeight);
        const lowResCtx = lowResCanvas.getContext("2d");
        if (!lowResCtx) {
            throw new Error("Failed to get 2d context for display canvas");
        }
        lowResCtx.imageSmoothingQuality = "high";
        lowResCtx.drawImage(canvas, 0, 0, displayWidth, displayHeight);
        // Use WebP for display blobs to save memory and improve performance (L6)
        const displayBlob = await lowResCanvas.convertToBlob({ type: "image/webp", quality: 0.90 });

        return { exportBlob, displayBlob, darknessFactor };
    }

    // Compute darknessFactor from the source image
    const darknessFactor = computeDarknessFactor(img);

    // Get the current darken mode (0=none is always generated)
    const currentDarkenMode = opts?.darkenMode ?? 0;

    // --- PASS 3A: FINAL (normal, darkenMode=0) ---
    const normalResult = await renderFinalAndExtract(gl, 0, darknessFactor);

    // --- PASS 3B: Generate current darkening mode (if not mode 0) ---
    let darkenAllResult: { exportBlob: Blob; displayBlob: Blob } | undefined;
    let contrastEdgesResult: { exportBlob: Blob; displayBlob: Blob } | undefined;
    let contrastFullResult: { exportBlob: Blob; displayBlob: Blob } | undefined;

    if (currentDarkenMode === 1) {
        darkenAllResult = await renderFinalAndExtract(gl, 1, darknessFactor);
    } else if (currentDarkenMode === 2) {
        contrastEdgesResult = await renderFinalAndExtract(gl, 2, darknessFactor);
    } else if (currentDarkenMode === 3) {
        contrastFullResult = await renderFinalAndExtract(gl, 3, darknessFactor);
    }


    // Cleanup per-render WebGL resources - keep context alive for next render
    gl.deleteTexture(texA);
    gl.deleteTexture(texB);
    gl.deleteTexture(imgTexture);
    gl.deleteFramebuffer(fbA);
    gl.deleteFramebuffer(fbB);
    gl.deleteProgram(progs.init);
    gl.deleteProgram(progs.step);
    gl.deleteProgram(progs.final);
    gl.deleteBuffer(quadBuffer);
    // Do NOT release context - it will be reused for the next image

    return {
        exportBlob: normalResult.exportBlob,
        exportDpi,
        exportBleedWidth: totalBleedMm, // Report total bleed (existing + generated)
        displayBlob: normalResult.displayBlob,
        displayDpi,
        displayBleedWidth: totalBleedMm,
        // Per-mode blobs (only present if that mode was generated)
        exportBlobDarkenAll: darkenAllResult?.exportBlob,
        displayBlobDarkenAll: darkenAllResult?.displayBlob,
        exportBlobContrastEdges: contrastEdgesResult?.exportBlob,
        displayBlobContrastEdges: contrastEdgesResult?.displayBlob,
        exportBlobContrastFull: contrastFullResult?.exportBlob,
        displayBlobContrastFull: contrastFullResult?.displayBlob,
        // Legacy (maps to contrast-edges if present)
        exportBlobDarkened: contrastEdgesResult?.exportBlob,
        displayBlobDarkened: contrastEdgesResult?.displayBlob,
        // For Card Editor live preview (undarkened version)
        baseDisplayBlob: normalResult.displayBlob,
        darknessFactor,
    };
}

/**
 * GPU-accelerated processing for images with existing bleed.
 * 
 * This is a fast path that skips the expensive JFA bleed generation.
 * It simply resizes the image to the target dimensions and applies
 * darkening effects using WebGL shaders.
 * 
 * Used for MPC cards and other images that already have bleed built-in.
 * 
 * Optimized for browser compatibility:
 * - Reuses a SINGLE WebGL context for all renders
 * - Only generates the needed modes (none + current darkenMode)
 * - Releases context once at the end
 */
export async function processExistingBleedWebGL(
    img: ImageBitmap,
    bleedWidthMm: number,
    opts?: { unit?: "mm" | "in"; exportDpi?: number; displayDpi?: number; darkenMode?: number; darkenThreshold?: number; darkenContrast?: number; darkenEdgeWidth?: number; darkenAmount?: number; darkenBrightness?: number; darkenAutoDetect?: boolean; inputBleedMm?: number }
): Promise<{
    exportBlob: Blob;
    exportDpi: number;
    exportBleedWidth: number;
    displayBlob: Blob;
    displayDpi: number;
    displayBleedWidth: number;
    // Per-mode darkened blobs (only present if that mode was generated)
    exportBlobDarkenAll?: Blob;
    displayBlobDarkenAll?: Blob;
    exportBlobContrastEdges?: Blob;
    displayBlobContrastEdges?: Blob;
    exportBlobContrastFull?: Blob;
    displayBlobContrastFull?: Blob;
    // Legacy
    exportBlobDarkened?: Blob;
    displayBlobDarkened?: Blob;
    // For Card Editor live preview
    baseDisplayBlob: Blob;
    baseExportBlob: Blob;
    darknessFactor: number;
    detectedHasBuiltInBleed?: boolean;
}> {
    const exportDpi = opts?.exportDpi ?? 300;
    const displayDpi = opts?.displayDpi ?? 300;
    const unit = opts?.unit ?? "mm";

    // Standard MTG card dimensions: 63x88mm
    const cardWidthMm = 63;
    const cardHeightMm = 88;

    // Convert bleed to mm
    const bleedMm = unit === "in" ? bleedWidthMm * 25.4 : bleedWidthMm;

    // Calculate dimensions at each DPI
    const exportBleedPx = Math.round(getBleedInPixels(bleedMm, "mm", exportDpi));
    const displayBleedPx = Math.round(getBleedInPixels(bleedMm, "mm", displayDpi));
    const exportWidth = Math.ceil(IN(cardWidthMm / 25.4, exportDpi) + exportBleedPx * 2);
    const exportHeight = Math.ceil(IN(cardHeightMm / 25.4, exportDpi) + exportBleedPx * 2);
    const displayWidth = Math.ceil(IN(cardWidthMm / 25.4, displayDpi) + displayBleedPx * 2);
    const displayHeight = Math.ceil(IN(cardHeightMm / 25.4, displayDpi) + displayBleedPx * 2);

    // Compute darknessFactor for adaptive effects
    const darknessFactor = computeDarknessFactor(img);


    // Get the current darken mode (0=none is always generated)
    const currentDarkenMode = opts?.darkenMode ?? 0;
    // Modes to generate: always mode 0, plus current mode if different
    const modesToGenerate = currentDarkenMode === 0 ? [0] : [0, currentDarkenMode];

    // Helper to render selected modes at a given resolution using a REUSED context
    async function renderSelectedModes(
        targetWidth: number,
        targetHeight: number,
        mimeType: "image/png" | "image/webp" = "image/png"
    ): Promise<Map<number, Blob>> {
        const blobs = new Map<number, Blob>();

        // Render only the needed modes
        for (const mode of modesToGenerate) {
            // Use new helper to get canvas
            const canvas = await renderBleedCanvasDirect(img, targetWidth, targetHeight, {
                ...opts,
                darkenMode: mode,
                darkenAutoDetect: opts?.darkenAutoDetect,
                mimeType
            });

            blobs.set(mode, await canvas.convertToBlob({
                type: mimeType,
                quality: mimeType === "image/webp" ? 0.90 : undefined
            }));
        }

        return blobs;
    }

    // Render export and display versions sequentially to avoid multiple WebGL contexts
    // Firefox aggressively reclaims contexts, so parallel creation causes crashes
    // Use WebP for display blobs (L6)
    const exportBlobs = await renderSelectedModes(exportWidth, exportHeight, "image/png");
    const displayBlobs = await renderSelectedModes(displayWidth, displayHeight, "image/webp");

    // Extract blobs from maps - mode 0 (none) is always present
    const exportBlob = exportBlobs.get(0)!;
    const displayBlob = displayBlobs.get(0)!;

    return {
        exportBlob,
        exportDpi,
        exportBleedWidth: bleedMm,
        displayBlob,
        displayDpi,
        displayBleedWidth: bleedMm,
        // Per-mode blobs (only present if that mode was generated)
        exportBlobDarkenAll: exportBlobs.get(1),
        displayBlobDarkenAll: displayBlobs.get(1),
        exportBlobContrastEdges: exportBlobs.get(2),
        displayBlobContrastEdges: displayBlobs.get(2),
        exportBlobContrastFull: exportBlobs.get(3),
        displayBlobContrastFull: displayBlobs.get(3),
        // Legacy (maps to contrast-edges if present)
        exportBlobDarkened: exportBlobs.get(2),
        displayBlobDarkened: displayBlobs.get(2),
        // For Card Editor live preview
        baseDisplayBlob: displayBlob,
        baseExportBlob: exportBlob,
        darknessFactor,
    };
}

/**
 * Direct low-level WebGL rendering of an image to a canvas (skipping JFA).
 * Returns an OffscreenCanvas containing the rendered result.
 * This is efficient for PDF generation as it avoids Blob encoding/decoding.
 */
export async function renderBleedCanvasDirect(
    img: ImageBitmap,
    targetWidth: number,
    targetHeight: number,
    opts: {
        darkenMode?: number;
        darkenThreshold?: number;
        darkenContrast?: number;
        darkenEdgeWidth?: number;
        darkenAmount?: number;
        darkenBrightness?: number;
        darkenAutoDetect?: boolean;
        mimeType?: "image/png" | "image/webp";
    }
): Promise<OffscreenCanvas> {
    const isExport = opts.mimeType === 'image/png';
    const contextManager = (!opts.mimeType || isExport) ? exportContextManager : displayContextManager;

    // Render at TARGET dimensions - the input should already be properly sized/trimmed
    const { canvas, gl } = contextManager.getContext(targetWidth, targetHeight);

    const vs = createShader(gl, gl.VERTEX_SHADER, VS_QUAD);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, FS_DIRECT);
    const program = createProgram(gl, vs, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    const quadBuffer = createQuadBuffer(gl);

    const imgTexture = createTexture(gl, img.width, img.height, img);
    gl.bindTexture(gl.TEXTURE_2D, imgTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.viewport(0, 0, targetWidth, targetHeight);
    const aPositionLoc = 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(aPositionLoc);
    gl.vertexAttribPointer(aPositionLoc, 2, gl.FLOAT, false, 0, 0);

    const darknessFactor = computeDarknessFactor(img);

    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, imgTexture);
    gl.uniform1i(gl.getUniformLocation(program, "u_image"), 0);
    gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), targetWidth, targetHeight);
    gl.uniform1f(gl.getUniformLocation(program, "u_darknessFactor"), darknessFactor);
    gl.uniform1f(gl.getUniformLocation(program, "u_darkenThreshold"), opts.darkenThreshold ?? 30);
    gl.uniform1f(gl.getUniformLocation(program, "u_darkenContrast"), opts.darkenContrast ?? 2.0);
    gl.uniform1f(gl.getUniformLocation(program, "u_darkenEdgeWidth"), opts.darkenEdgeWidth ?? 0.1);
    gl.uniform1f(gl.getUniformLocation(program, "u_darkenAmount"), opts.darkenAmount ?? 1.0);
    gl.uniform1f(gl.getUniformLocation(program, "u_darkenBrightness"), opts.darkenBrightness ?? -50);
    gl.uniform1i(gl.getUniformLocation(program, "u_darkenMode"), opts.darkenMode ?? 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.deleteTexture(imgTexture);
    gl.deleteBuffer(quadBuffer);
    gl.deleteProgram(program);

    // Copy to result canvas (context canvas is reused)
    const resultCanvas = new OffscreenCanvas(targetWidth, targetHeight);
    const resultCtx = resultCanvas.getContext('2d');
    if (resultCtx) {
        resultCtx.drawImage(canvas, 0, 0);
    }
    return resultCanvas;
}
