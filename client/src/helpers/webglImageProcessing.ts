import {
    MM_TO_PX,
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
export function initWebGLPrograms(gl: WebGL2RenderingContext): WebGLPrograms {
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
export function calculateImagePlacement(
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
    opts: { unit?: "mm" | "in"; dpi?: number; darkenNearBlack?: boolean }
): Promise<OffscreenCanvas> {
    const dpi = opts?.dpi ?? 300;
    const targetCardWidth = MM_TO_PX(63, dpi);  // Standard MTG card width: 63mm
    const targetCardHeight = MM_TO_PX(88, dpi); // Standard MTG card height: 88mm
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

    // Calculate image placement (for source image sampling)
    const { drawWidth, drawHeight, offsetX, offsetY } = calculateImagePlacement(
        img,
        targetCardWidth,
        targetCardHeight
    );

    // The content area is ALWAYS positioned at (bleed, bleed) with size targetCardWidth × targetCardHeight
    // This ensures equal bleed margins on all sides
    const contentOffsetX = bleed;
    const contentOffsetY = bleed;

    // Calculate the scale factor and source crop offsets for the shader
    // The shader will sample the source image with proper scaling and cropping
    const scaleX = drawWidth / img.width;
    const scaleY = drawHeight / img.height;
    // offsetX/Y are how much of the SCALED image to crop, so we need to convert to source image pixels
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
    // Content area is exactly targetCardWidth × targetCardHeight, positioned at (bleed, bleed)
    gl.uniform2f(gl.getUniformLocation(progs.init, "u_imageSize"), targetCardWidth, targetCardHeight);
    gl.uniform2f(gl.getUniformLocation(progs.init, "u_offset"), contentOffsetX, contentOffsetY);
    // Pass source image dimensions and crop offsets for proper sampling
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

    gl.uniform2f(gl.getUniformLocation(progs.final, "u_resolution"), finalWidth, finalHeight);
    // Content area is exactly targetCardWidth × targetCardHeight, positioned at (bleed, bleed)
    gl.uniform2f(gl.getUniformLocation(progs.final, "u_imageSize"), targetCardWidth, targetCardHeight);
    gl.uniform2f(gl.getUniformLocation(progs.final, "u_offset"), contentOffsetX, contentOffsetY);
    gl.uniform1i(gl.getUniformLocation(progs.final, "u_darken"), opts.darkenNearBlack ? 1 : 0);
    // Pass source image dimensions and crop offsets for proper sampling
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

    return canvas;
}

/**
 * Process a card image to generate all required blobs (export + display, normal + darkened)
 */
export async function processCardImageWebGL(
    img: ImageBitmap,
    bleedWidthMm: number,
    opts?: { unit?: "mm" | "in"; exportDpi?: number; displayDpi?: number }
): Promise<{
    exportBlob: Blob;
    exportDpi: number;
    exportBleedWidth: number;
    displayBlob: Blob;
    displayDpi: number;
    displayBleedWidth: number;
    exportBlobDarkened: Blob;
    displayBlobDarkened: Blob;
}> {
    const exportDpi = opts?.exportDpi ?? 300;
    const displayDpi = opts?.displayDpi ?? 300;
    const unit = opts?.unit ?? "mm";

    // Generate high-resolution canvas for export using WebGL (normal version)
    const highResCanvas = await generateBleedCanvasWebGL(img, bleedWidthMm, {
        unit,
        dpi: exportDpi,
        darkenNearBlack: false,
    });
    const exportBlob = await highResCanvas.convertToBlob({ type: "image/png" });

    // Generate low-resolution canvas for display by downscaling (normal version)
    const displayWidth = (highResCanvas.width / exportDpi) * displayDpi;
    const displayHeight = (highResCanvas.height / exportDpi) * displayDpi;
    const lowResCanvas = new OffscreenCanvas(displayWidth, displayHeight);
    const lowResCtx = lowResCanvas.getContext("2d")!;
    lowResCtx.imageSmoothingQuality = "high";
    lowResCtx.drawImage(highResCanvas, 0, 0, displayWidth, displayHeight);
    const displayBlob = await lowResCanvas.convertToBlob({ type: "image/png" });

    // Generate darkened versions
    const highResCanvasDarkened = await generateBleedCanvasWebGL(img, bleedWidthMm, {
        unit,
        dpi: exportDpi,
        darkenNearBlack: true,
    });
    const exportBlobDarkened = await highResCanvasDarkened.convertToBlob({ type: "image/png" });

    const lowResCanvasDarkened = new OffscreenCanvas(displayWidth, displayHeight);
    const lowResCtxDarkened = lowResCanvasDarkened.getContext("2d")!;
    lowResCtxDarkened.imageSmoothingQuality = "high";
    lowResCtxDarkened.drawImage(highResCanvasDarkened, 0, 0, displayWidth, displayHeight);
    const displayBlobDarkened = await lowResCanvasDarkened.convertToBlob({ type: "image/png" });

    return {
        exportBlob,
        exportDpi,
        exportBleedWidth: bleedWidthMm,
        displayBlob,
        displayDpi,
        displayBleedWidth: bleedWidthMm,
        exportBlobDarkened,
        displayBlobDarkened,
    };
}
