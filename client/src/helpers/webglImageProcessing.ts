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

    gl.uniform2f(gl.getUniformLocation(progs.final, "u_resolution"), finalWidth, finalHeight);
    gl.uniform2f(gl.getUniformLocation(progs.final, "u_imageSize"), targetCardWidth, targetCardHeight);
    gl.uniform2f(gl.getUniformLocation(progs.final, "u_offset"), bleed, bleed);
    gl.uniform1i(gl.getUniformLocation(progs.final, "u_darken"), opts.darkenNearBlack ? 1 : 0);
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
    exportBlobDarkened: Blob;
    displayBlobDarkened: Blob;
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

    // The input image represents card + inputHasBleedMm, so calculate its expected dimensions
    const inputBleedPx = Math.round(getBleedInPixels(inputHasBleedMm, 'mm', exportDpi));
    const inputExpectedWidth = targetCardWidth + inputBleedPx * 2;
    const inputExpectedHeight = targetCardHeight + inputBleedPx * 2;

    // The additional bleed to generate around the input
    const additionalBleedPx = Math.round(getBleedInPixels(additionalBleedMm, 'mm', exportDpi));

    // Final output dimensions: input dimensions + additional bleed on each side
    const finalWidth = Math.ceil(inputExpectedWidth + additionalBleedPx * 2);
    const finalHeight = Math.ceil(inputExpectedHeight + additionalBleedPx * 2);

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
    // When input has existing bleed, the image represents card + existing bleed, not just the card
    const { drawWidth, drawHeight, offsetX, offsetY } = calculateImagePlacement(
        img,
        inputExpectedWidth,  // Use input dimensions (card + existing bleed)
        inputExpectedHeight
    );

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
    gl.uniform2f(gl.getUniformLocation(progs.init, "u_imageSize"), inputExpectedWidth, inputExpectedHeight);
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
        darken: boolean
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
        glCtx.uniform2f(glCtx.getUniformLocation(progs.final, "u_imageSize"), inputExpectedWidth, inputExpectedHeight);
        glCtx.uniform2f(glCtx.getUniformLocation(progs.final, "u_offset"), additionalBleedPx, additionalBleedPx);
        glCtx.uniform1i(glCtx.getUniformLocation(progs.final, "u_darken"), darken ? 1 : 0);
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

    // --- PASS 3A: FINAL (normal, darken=false) ---
    const normalResult = await renderFinalAndExtract(gl, false);


    // --- PASS 3B: FINAL (darkened, darken=true) ---
    const darkenedResult = await renderFinalAndExtract(gl, true);


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




    return {
        exportBlob: normalResult.exportBlob,
        exportDpi,
        exportBleedWidth: totalBleedMm, // Report total bleed (existing + generated)
        displayBlob: normalResult.displayBlob,
        displayDpi,
        displayBleedWidth: totalBleedMm,
        exportBlobDarkened: darkenedResult.exportBlob,
        displayBlobDarkened: darkenedResult.displayBlob,
    };
}
