import {
    IN,
    getBleedInPixels,
} from "./imageProcessing";
import {
    createShader,
    createProgram,
    createTexture,
    createFramebuffer,
    createQuadBuffer,
} from "./webgl/webglUtils";
import { VS_QUAD, FS_INIT, FS_STEP, FS_FINAL } from "./webgl/shaders";
import type { DarkenMode } from "../store/settings";

/**
 * Convert darkenMode string to shader int value
 * 0=none, 1=darken-all, 2=contrast-edges, 3=contrast-full
 */
function darkenModeToInt(mode: DarkenMode | undefined): number {
    switch (mode) {
        case 'none': return 0;
        case 'darken-all': return 1;
        case 'contrast-edges': return 2;
        case 'contrast-full': return 3;
        default: return 0;
    }
}

/**
 * Compute the darknessFactor from an ImageBitmap by building a luminance histogram.
 * Returns a value 0-1 where:
 * - 0 = very dark image (10th percentile luminance near 90)
 * - 1 = light image (10th percentile luminance near 20 or below)
 * 
 * This is used for adaptive edge contrast - darker images get less aggressive
 * darkening to avoid crushing details.
 */
function computeDarknessFactor(img: ImageBitmap): number {
    // Create a small canvas to sample the image (we don't need full resolution)
    const sampleSize = 256; // Sample at max 256x256 for performance
    const scale = Math.min(1, sampleSize / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);

    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, w, h);

    const imageData = ctx.getImageData(0, 0, w, h);
    const d = imageData.data;

    // Build luminance histogram (sample every 4th pixel for speed)
    const hist = new Uint32Array(256);
    const sampleStep = 4 * 4; // every 4th pixel (4 bytes per pixel)

    for (let i = 0; i < d.length; i += sampleStep) {
        const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        hist[Math.max(0, Math.min(255, l | 0))]++;
    }

    // Find 10th percentile luminance
    const total = hist.reduce((a, b) => a + b, 0);
    let acc = 0;
    let p10 = 0;

    for (let i = 0; i < 256; i++) {
        acc += hist[i];
        if (acc >= total * 0.1) {
            p10 = i;
            break;
        }
    }

    // Convert to darknessFactor: (90 - p10) / 70, clamped to 0-1
    // Dark images (high p10) → lower factor → less aggressive darkening
    // Light images (low p10) → higher factor → more aggressive darkening
    return Math.min(1, Math.max(0, (90 - p10) / 70));
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
    opts: { unit?: "mm" | "in"; dpi?: number; darkenMode?: DarkenMode }
): Promise<OffscreenCanvas> {
    const dpi = opts?.dpi ?? 300;
    const targetCardWidth = IN(2.48, dpi);
    const targetCardHeight = IN(3.47, dpi);
    const bleed = Math.round(getBleedInPixels(bleedWidth, opts?.unit ?? "mm", dpi));

    const finalWidth = Math.ceil(targetCardWidth + bleed * 2);
    const finalHeight = Math.ceil(targetCardHeight + bleed * 2);

    // Create fresh canvas and context for this image
    const canvas = new OffscreenCanvas(finalWidth, finalHeight);
    const gl = canvas.getContext("webgl2", {
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
        antialias: false,
    });

    if (!gl) {
        throw new Error("WebGL2 not supported");
    }

    // Initialize WebGL resources for this context
    const progs = initWebGLPrograms(gl);
    const quadBuffer = createQuadBuffer(gl);

    // Calculate image placement
    const { drawWidth, drawHeight, offsetX, offsetY } = calculateImagePlacement(
        img,
        targetCardWidth,
        targetCardHeight
    );

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
    gl.useProgram(progs.step);
    gl.uniform2f(gl.getUniformLocation(progs.step, "u_resolution"), finalWidth, finalHeight);
    const uStepLoc = gl.getUniformLocation(progs.step, "u_step");
    const uSeedsLoc = gl.getUniformLocation(progs.step, "u_seeds");

    let currentFb = fbA;
    let currentTex = texA;
    let nextFb = fbB;
    let nextTex = texB;

    const maxDim = Math.max(finalWidth, finalHeight);
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

    // --- PASS 3: FINAL ---
    // Render to screen (null framebuffer)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(progs.final);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, currentTex); // The final seed map
    gl.uniform1i(gl.getUniformLocation(progs.final, "u_seeds"), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, imgTexture);
    gl.uniform1i(gl.getUniformLocation(progs.final, "u_image"), 1);

    // Compute darknessFactor for adaptive edge contrast
    const darkenModeInt = darkenModeToInt(opts.darkenMode);
    const darknessFactor = darkenModeInt > 0 ? computeDarknessFactor(img) : 0.5;

    gl.uniform2f(gl.getUniformLocation(progs.final, "u_resolution"), finalWidth, finalHeight);
    gl.uniform2f(gl.getUniformLocation(progs.final, "u_imageSize"), targetCardWidth, targetCardHeight);
    gl.uniform2f(gl.getUniformLocation(progs.final, "u_offset"), bleed, bleed);
    gl.uniform1i(gl.getUniformLocation(progs.final, "u_darkenMode"), darkenModeInt);
    gl.uniform1f(gl.getUniformLocation(progs.final, "u_darknessFactor"), darknessFactor);
    gl.uniform2f(gl.getUniformLocation(progs.final, "u_srcImageSize"), img.width, img.height);
    gl.uniform2f(gl.getUniformLocation(progs.final, "u_srcOffset"), sourceOffsetX, sourceOffsetY);
    gl.uniform2f(gl.getUniformLocation(progs.final, "u_scale"), scaleX, scaleY);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Cleanup WebGL resources
    gl.deleteTexture(texA);
    gl.deleteTexture(texB);
    gl.deleteTexture(imgTexture);
    gl.deleteFramebuffer(fbA);
    gl.deleteFramebuffer(fbB);
    gl.deleteProgram(progs.init);
    gl.deleteProgram(progs.step);
    gl.deleteProgram(progs.final);
    gl.deleteBuffer(quadBuffer);

    // Explicitly release WebGL context to avoid hitting browser context limits
    gl.getExtension('WEBGL_lose_context')?.loseContext();

    return canvas;
}

/**
 * Process a card image to generate all required blobs (export + display, normal + darkened)
 * Optimized: Runs JFA once and generates both versions with two final render passes
 */
export async function processCardImageWebGL(
    img: ImageBitmap,
    bleedWidthMm: number,
    opts?: { unit?: "mm" | "in"; exportDpi?: number; displayDpi?: number; inputHasBleedMm?: number }
): Promise<{
    exportBlob: Blob;
    exportDpi: number;
    exportBleedWidth: number;
    displayBlob: Blob;
    displayDpi: number;
    displayBleedWidth: number;
    // Per-mode darkened blobs
    exportBlobDarkenAll: Blob;
    displayBlobDarkenAll: Blob;
    exportBlobContrastEdges: Blob;
    displayBlobContrastEdges: Blob;
    exportBlobContrastFull: Blob;
    displayBlobContrastFull: Blob;
    // Legacy (kept for backwards compatibility)
    exportBlobDarkened: Blob;
    displayBlobDarkened: Blob;
    // For Card Editor live preview
    baseDisplayBlob: Blob;
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

    // Create WebGL context once for all processing
    const canvas = new OffscreenCanvas(finalWidth, finalHeight);
    const gl = canvas.getContext("webgl2", {
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
        antialias: false,
    });

    if (!gl) {
        throw new Error("WebGL2 not supported");
    }



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
    gl.useProgram(progs.step);
    gl.uniform2f(gl.getUniformLocation(progs.step, "u_resolution"), finalWidth, finalHeight);
    const uStepLoc = gl.getUniformLocation(progs.step, "u_step");
    const uSeedsLoc = gl.getUniformLocation(progs.step, "u_seeds");

    let currentFb = fbA;
    let currentTex = texA;
    let nextFb = fbB;
    let nextTex = texB;

    const maxDim = Math.max(finalWidth, finalHeight);
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



    // Helper function to render final pass and extract blobs
    async function renderFinalAndExtract(
        glCtx: WebGL2RenderingContext,
        darkenMode: number,
        darknessFactor: number
    ): Promise<{ exportBlob: Blob; displayBlob: Blob }> {
        // Render to screen (null framebuffer)
        glCtx.bindFramebuffer(glCtx.FRAMEBUFFER, null);
        glCtx.useProgram(progs.final);

        glCtx.activeTexture(glCtx.TEXTURE0);
        glCtx.bindTexture(glCtx.TEXTURE_2D, currentTex);
        glCtx.uniform1i(glCtx.getUniformLocation(progs.final, "u_seeds"), 0);

        glCtx.activeTexture(glCtx.TEXTURE1);
        glCtx.bindTexture(glCtx.TEXTURE_2D, imgTexture);
        glCtx.uniform1i(glCtx.getUniformLocation(progs.final, "u_image"), 1);

        glCtx.uniform2f(glCtx.getUniformLocation(progs.final, "u_resolution"), finalWidth, finalHeight);
        glCtx.uniform2f(glCtx.getUniformLocation(progs.final, "u_imageSize"), inputWidth, inputHeight);
        glCtx.uniform2f(glCtx.getUniformLocation(progs.final, "u_offset"), additionalBleedPx, additionalBleedPx);
        glCtx.uniform1i(glCtx.getUniformLocation(progs.final, "u_darkenMode"), darkenMode);
        glCtx.uniform1f(glCtx.getUniformLocation(progs.final, "u_darknessFactor"), darknessFactor);
        glCtx.uniform2f(glCtx.getUniformLocation(progs.final, "u_srcImageSize"), img.width, img.height);
        glCtx.uniform2f(glCtx.getUniformLocation(progs.final, "u_srcOffset"), sourceOffsetX, sourceOffsetY);
        glCtx.uniform2f(glCtx.getUniformLocation(progs.final, "u_scale"), scaleX, scaleY);

        glCtx.drawArrays(glCtx.TRIANGLES, 0, 6);

        const exportBlob = await canvas.convertToBlob({ type: "image/png" });

        // Create display version by downscaling
        const displayWidth = (finalWidth / exportDpi) * displayDpi;
        const displayHeight = (finalHeight / exportDpi) * displayDpi;
        const lowResCanvas = new OffscreenCanvas(displayWidth, displayHeight);
        const lowResCtx = lowResCanvas.getContext("2d")!;
        lowResCtx.imageSmoothingQuality = "high";
        lowResCtx.drawImage(canvas, 0, 0, displayWidth, displayHeight);
        const displayBlob = await lowResCanvas.convertToBlob({ type: "image/png" });

        return { exportBlob, displayBlob };
    }

    // Compute darknessFactor from the source image
    const darknessFactor = computeDarknessFactor(img);

    // --- PASS 3A: FINAL (normal, darkenMode=0) ---
    const normalResult = await renderFinalAndExtract(gl, 0, darknessFactor);

    // --- PASS 3B-D: Generate all 3 darkening modes ---
    const darkenAllResult = await renderFinalAndExtract(gl, 1, darknessFactor);
    const contrastEdgesResult = await renderFinalAndExtract(gl, 2, darknessFactor);
    const contrastFullResult = await renderFinalAndExtract(gl, 3, darknessFactor);


    // Cleanup WebGL resources
    gl.deleteTexture(texA);
    gl.deleteTexture(texB);
    gl.deleteTexture(imgTexture);
    gl.deleteFramebuffer(fbA);
    gl.deleteFramebuffer(fbB);
    gl.deleteProgram(progs.init);
    gl.deleteProgram(progs.step);
    gl.deleteProgram(progs.final);
    gl.deleteBuffer(quadBuffer);

    // Explicitly release WebGL context to avoid hitting browser context limits
    gl.getExtension('WEBGL_lose_context')?.loseContext();

    return {
        exportBlob: normalResult.exportBlob,
        exportDpi,
        exportBleedWidth: totalBleedMm, // Report total bleed (existing + generated)
        displayBlob: normalResult.displayBlob,
        displayDpi,
        displayBleedWidth: totalBleedMm,
        // Per-mode blobs
        exportBlobDarkenAll: darkenAllResult.exportBlob,
        displayBlobDarkenAll: darkenAllResult.displayBlob,
        exportBlobContrastEdges: contrastEdgesResult.exportBlob,
        displayBlobContrastEdges: contrastEdgesResult.displayBlob,
        exportBlobContrastFull: contrastFullResult.exportBlob,
        displayBlobContrastFull: contrastFullResult.displayBlob,
        // Legacy (maps to contrast-edges for backwards compatibility)
        exportBlobDarkened: contrastEdgesResult.exportBlob,
        displayBlobDarkened: contrastEdgesResult.displayBlob,
        // For Card Editor live preview (undarkened version)
        baseDisplayBlob: normalResult.displayBlob,
    };
}
