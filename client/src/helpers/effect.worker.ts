/**
 * Effect Pre-rendering Worker
 * 
 * Runs WebGL rendering in a separate thread to avoid blocking the UI.
 * Used by EffectProcessor to process card effects in the background.
 * 
 * Imports shared utilities from cardCanvasWorker.ts to avoid duplication.
 */

import type { RenderParams } from '../components/CardCanvas/types';
import {
    VS_CARD_CANVAS,
    FS_CARD_CANVAS,
    createShader,
    createProgram,
    createTextureFromBitmap,
    updateUniforms,
    type UniformLocations,
} from './cardCanvasWorker';

// --- Message types ---
interface EffectWorkerMessage {
    taskId: string;
    imageData: ArrayBuffer;  // Transferred from main thread
    imageWidth: number;
    imageHeight: number;
    params: RenderParams;
}

interface EffectWorkerSuccessResponse {
    taskId: string;
    blob: Blob;
    error?: undefined;
}

interface EffectWorkerErrorResponse {
    taskId: string;
    error: string;
}

// --- Main rendering function ---
async function renderWithOverrides(
    imageData: ArrayBuffer,
    imageWidth: number,
    imageHeight: number,
    params: RenderParams
): Promise<Blob> {
    // Create ImageData from the buffer
    const clampedArray = new Uint8ClampedArray(imageData);
    const imgData = new ImageData(clampedArray, imageWidth, imageHeight);

    // Create ImageBitmap from ImageData
    const imageBitmap = await createImageBitmap(imgData);

    const width = imageBitmap.width;
    const height = imageBitmap.height;

    // Create OffscreenCanvas with WebGL2
    const canvas = new OffscreenCanvas(width, height);
    const gl = canvas.getContext('webgl2', {
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
        antialias: false,
    });

    if (!gl) {
        imageBitmap.close();
        throw new Error('WebGL2 not supported in worker');
    }

    try {
        // Create shaders and program using shared utilities
        const vs = createShader(gl, gl.VERTEX_SHADER, VS_CARD_CANVAS);
        const fs = createShader(gl, gl.FRAGMENT_SHADER, FS_CARD_CANVAS);
        const program = createProgram(gl, vs, fs);
        gl.deleteShader(vs);
        gl.deleteShader(fs);

        // Get uniform locations (same structure as cardCanvasWorker)
        const uniforms: UniformLocations = {
            u_baseTexture: gl.getUniformLocation(program, 'u_baseTexture'),
            u_resolution: gl.getUniformLocation(program, 'u_resolution'),
            u_brightness: gl.getUniformLocation(program, 'u_brightness'),
            u_contrast: gl.getUniformLocation(program, 'u_contrast'),
            u_saturation: gl.getUniformLocation(program, 'u_saturation'),
            u_sharpness: gl.getUniformLocation(program, 'u_sharpness'),
            u_pop: gl.getUniformLocation(program, 'u_pop'),
            u_hueShift: gl.getUniformLocation(program, 'u_hueShift'),
            u_sepia: gl.getUniformLocation(program, 'u_sepia'),
            u_tintColor: gl.getUniformLocation(program, 'u_tintColor'),
            u_tintAmount: gl.getUniformLocation(program, 'u_tintAmount'),
            u_redBalance: gl.getUniformLocation(program, 'u_redBalance'),
            u_greenBalance: gl.getUniformLocation(program, 'u_greenBalance'),
            u_blueBalance: gl.getUniformLocation(program, 'u_blueBalance'),
            u_cyanBalance: gl.getUniformLocation(program, 'u_cyanBalance'),
            u_magentaBalance: gl.getUniformLocation(program, 'u_magentaBalance'),
            u_yellowBalance: gl.getUniformLocation(program, 'u_yellowBalance'),
            u_blackBalance: gl.getUniformLocation(program, 'u_blackBalance'),
            u_shadowsIntensity: gl.getUniformLocation(program, 'u_shadowsIntensity'),
            u_midtonesIntensity: gl.getUniformLocation(program, 'u_midtonesIntensity'),
            u_highlightsIntensity: gl.getUniformLocation(program, 'u_highlightsIntensity'),
            u_noiseReduction: gl.getUniformLocation(program, 'u_noiseReduction'),
            u_cmykPreview: gl.getUniformLocation(program, 'u_cmykPreview'),
            u_holoEffect: gl.getUniformLocation(program, 'u_holoEffect'),
            u_holoStrength: gl.getUniformLocation(program, 'u_holoStrength'),
            u_holoAreaMode: gl.getUniformLocation(program, 'u_holoAreaMode'),
            u_holoAreaThreshold: gl.getUniformLocation(program, 'u_holoAreaThreshold'),
            u_holoAngle: gl.getUniformLocation(program, 'u_holoAngle'),
            u_holoSweepWidth: gl.getUniformLocation(program, 'u_holoSweepWidth'),
            u_holoStarSize: gl.getUniformLocation(program, 'u_holoStarSize'),
            u_holoStarVariety: gl.getUniformLocation(program, 'u_holoStarVariety'),
            u_holoBlur: gl.getUniformLocation(program, 'u_holoBlur'),
            u_holoProbability: gl.getUniformLocation(program, 'u_holoProbability'),
            u_holoUvOffset: gl.getUniformLocation(program, 'u_holoUvOffset'),
            u_holoUvScale: gl.getUniformLocation(program, 'u_holoUvScale'),
            u_colorReplaceEnabled: gl.getUniformLocation(program, 'u_colorReplaceEnabled'),
            u_colorReplaceSource: gl.getUniformLocation(program, 'u_colorReplaceSource'),
            u_colorReplaceTarget: gl.getUniformLocation(program, 'u_colorReplaceTarget'),
            u_colorReplaceThreshold: gl.getUniformLocation(program, 'u_colorReplaceThreshold'),
            u_gamma: gl.getUniformLocation(program, 'u_gamma'),
            u_vignetteAmount: gl.getUniformLocation(program, 'u_vignetteAmount'),
            u_vignetteSize: gl.getUniformLocation(program, 'u_vignetteSize'),
            u_vignetteFeather: gl.getUniformLocation(program, 'u_vignetteFeather'),
        };

        // Create quad VAO
        const vao = gl.createVertexArray();
        if (!vao) throw new Error('Failed to create VAO');
        gl.bindVertexArray(vao);

        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1, 1, -1, -1, 1, 1, 1,
        ]), gl.STATIC_DRAW);

        const positionLoc = gl.getAttribLocation(program, 'a_position');
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);

        // Create texture from image using shared utility
        const texture = createTextureFromBitmap(gl, imageBitmap);

        // Set up rendering
        gl.viewport(0, 0, width, height);
        gl.useProgram(program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(uniforms.u_baseTexture, 0);

        // Set all uniforms using shared utility
        updateUniforms(gl, uniforms, params, width, height);

        // Draw
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // Get result
        const blob = await canvas.convertToBlob({ type: 'image/png' });

        // Cleanup
        gl.deleteTexture(texture);
        gl.deleteBuffer(positionBuffer);
        gl.deleteVertexArray(vao);
        gl.deleteProgram(program);
        gl.getExtension('WEBGL_lose_context')?.loseContext();

        return blob;
    } finally {
        imageBitmap.close();
    }
}

// --- Worker message handler ---
self.onmessage = async (event: MessageEvent<EffectWorkerMessage>) => {
    const { taskId, imageData, imageWidth, imageHeight, params } = event.data;

    try {
        const blob = await renderWithOverrides(imageData, imageWidth, imageHeight, params);
        const response: EffectWorkerSuccessResponse = { taskId, blob };
        self.postMessage(response);
    } catch (error) {
        const response: EffectWorkerErrorResponse = {
            taskId,
            error: error instanceof Error ? error.message : String(error),
        };
        self.postMessage(response);
    }
};
