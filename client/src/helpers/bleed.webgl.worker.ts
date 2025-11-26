declare const self: DedicatedWorkerGlobalScope;

import {
    IN,
    toProxied,
    getBleedInPixels,
    trimBleedFromBitmap,
    fetchWithRetry,
} from "./imageProcessing";
import {
    createShader,
    createProgram,
    createTexture,
    createFramebuffer,
    createQuadBuffer,
} from "./webgl/webglUtils";
import { VS_QUAD, FS_INIT, FS_STEP, FS_FINAL } from "./webgl/shaders";

let API_BASE = "";

function initWebGL(gl: WebGL2RenderingContext) {
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

async function generateBleedCanvasWebGL(
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
    const progs = initWebGL(gl);
    const quadBuffer = createQuadBuffer(gl);

    // Calculate image placement
    const aspectRatio = img.width / img.height;
    const targetAspect = targetCardWidth / targetCardHeight;

    let drawWidth = targetCardWidth;
    let drawHeight = targetCardHeight;
    let offsetX = 0;
    let offsetY = 0;

    if (aspectRatio > targetAspect) {
        drawHeight = targetCardHeight;
        drawWidth = img.width * (targetCardHeight / img.height);
        offsetX = (drawWidth - targetCardWidth) / 2;
    } else {
        drawWidth = targetCardWidth;
        drawHeight = img.height * (targetCardWidth / img.width);
        offsetY = (drawHeight - targetCardHeight) / 2;
    }

    // Calculate offset in WebGL coordinates (bottom-left origin)
    // The image needs to be centered in the bleed area
    const imageOffsetX = bleed - offsetX;
    const imageOffsetY = bleed - offsetY;

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
    gl.uniform2f(gl.getUniformLocation(progs.init, "u_imageSize"), drawWidth, drawHeight);
    gl.uniform2f(gl.getUniformLocation(progs.init, "u_offset"), imageOffsetX, imageOffsetY);

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
    gl.uniform2f(gl.getUniformLocation(progs.final, "u_imageSize"), drawWidth, drawHeight);
    gl.uniform2f(gl.getUniformLocation(progs.final, "u_offset"), imageOffsetX, imageOffsetY);
    gl.uniform1i(gl.getUniformLocation(progs.final, "u_darken"), opts.darkenNearBlack ? 1 : 0);

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

async function addBleedEdge(
    img: ImageBitmap,
    bleedOverride?: number,
    opts?: { unit?: "mm" | "in"; bleedEdgeWidth?: number; dpi?: number; darkenNearBlack?: boolean }
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
    const exportDpi = opts?.dpi ?? 300;
    const exportBleedWidth = bleedOverride ?? opts?.bleedEdgeWidth ?? 0;

    const displayDpi = 300;
    const displayBleedWidth = exportBleedWidth;

    // Generate high-resolution canvas for export using WebGL (normal version)
    const highResCanvas = await generateBleedCanvasWebGL(img, exportBleedWidth, { ...opts, dpi: exportDpi, darkenNearBlack: false });
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
    const highResCanvasDarkened = await generateBleedCanvasWebGL(img, exportBleedWidth, { ...opts, dpi: exportDpi, darkenNearBlack: true });
    const exportBlobDarkened = await highResCanvasDarkened.convertToBlob({ type: "image/png" });

    const lowResCanvasDarkened = new OffscreenCanvas(displayWidth, displayHeight);
    const lowResCtxDarkened = lowResCanvasDarkened.getContext("2d")!;
    lowResCtxDarkened.imageSmoothingQuality = "high";
    lowResCtxDarkened.drawImage(highResCanvasDarkened, 0, 0, displayWidth, displayHeight);
    const displayBlobDarkened = await lowResCanvasDarkened.convertToBlob({ type: "image/png" });

    return {
        exportBlob,
        exportDpi,
        exportBleedWidth,
        displayBlob,
        displayDpi,
        displayBleedWidth,
        exportBlobDarkened,
        displayBlobDarkened,
    };
}

const imageCache = new Map<string, Promise<Blob>>();

self.onmessage = async (e: MessageEvent) => {
    const {
        uuid,
        url,
        bleedEdgeWidth,
        unit,
        apiBase,
        isUserUpload,
        hasBakedBleed,
        dpi,
        darkenNearBlack,
    } = e.data;
    API_BASE = apiBase;

    if (typeof OffscreenCanvas === "undefined") {
        self.postMessage({ uuid, error: "OffscreenCanvas is not supported in this environment." });
        return;
    }

    try {
        const proxiedUrl = url.startsWith("http") ? toProxied(url, API_BASE) : url;

        let blob: Blob;

        if (imageCache.has(proxiedUrl)) {
            blob = await imageCache.get(proxiedUrl)!;
        } else {
            const loadPromise = (async () => {
                const response = await fetchWithRetry(proxiedUrl, 3, 250);
                return await response.blob();
            })();
            imageCache.set(proxiedUrl, loadPromise);
            try {
                blob = await loadPromise;
            } catch (e) {
                imageCache.delete(proxiedUrl);
                throw e;
            }
        }

        let imageBitmap = await createImageBitmap(blob);

        if (isUserUpload && hasBakedBleed) {
            const trimmed = await trimBleedFromBitmap(imageBitmap);
            if (trimmed !== imageBitmap) {
                imageBitmap.close();
                imageBitmap = trimmed;
            }
        }

        const result = await addBleedEdge(imageBitmap, bleedEdgeWidth, {
            unit,
            bleedEdgeWidth,
            dpi,
            darkenNearBlack,
        });
        imageBitmap.close();
        self.postMessage({ uuid, ...result });
    } catch (error: unknown) {
        if (error instanceof Error) {
            self.postMessage({ uuid, error: error.message });
        } else {
            self.postMessage({
                uuid,
                error: "An unknown error occurred in the bleed worker.",
            });
        }
    }
};
