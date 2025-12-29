/**
 * CardCanvas Component
 * 
 * WebGL-based card renderer with real-time adjustable parameters.
 * Used in the Card Editor for live preview and will be used in
 * PageView for Milestone 2.
 */

import { useRef, useEffect, useCallback, memo, useState } from 'react';
import { VS_CARD_CANVAS, FS_CARD_CANVAS } from './shaders';
import { darkenModeToInt, type CardCanvasProps, type RenderParams } from './types';

// Uniform locations cache
interface UniformLocations {
    u_baseTexture: WebGLUniformLocation | null;
    u_distanceField: WebGLUniformLocation | null;
    u_resolution: WebGLUniformLocation | null;
    u_darknessFactor: WebGLUniformLocation | null;
    u_darkenMode: WebGLUniformLocation | null;
    u_darkenThreshold: WebGLUniformLocation | null;
    u_darkenContrast: WebGLUniformLocation | null;
    u_darkenEdgeWidth: WebGLUniformLocation | null;
    u_darkenAmount: WebGLUniformLocation | null;
    u_darkenBrightness: WebGLUniformLocation | null;
    u_brightness: WebGLUniformLocation | null;
    u_contrast: WebGLUniformLocation | null;
    u_saturation: WebGLUniformLocation | null;
    u_sharpness: WebGLUniformLocation | null;
}

interface WebGLState {
    gl: WebGL2RenderingContext;
    program: WebGLProgram;
    uniforms: UniformLocations;
    baseTexture: WebGLTexture | null;
    distanceTexture: WebGLTexture | null;
    vao: WebGLVertexArrayObject;
}

/**
 * Create and compile a shader.
 */
function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Failed to create shader');

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Shader compile error: ${info}`);
    }

    return shader;
}

/**
 * Create and link a program.
 */
function createProgram(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
    const program = gl.createProgram();
    if (!program) throw new Error('Failed to create program');

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`Program link error: ${info}`);
    }

    return program;
}

/**
 * Create a texture from a Blob.
 */
async function createTextureFromBlob(gl: WebGL2RenderingContext, blob: Blob): Promise<WebGLTexture> {
    const bitmap = await createImageBitmap(blob);

    const texture = gl.createTexture();
    if (!texture) throw new Error('Failed to create texture');

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    bitmap.close();

    return texture;
}

/**
 * Initialize WebGL state.
 */
function initWebGL(canvas: HTMLCanvasElement): WebGLState {
    const gl = canvas.getContext('webgl2', {
        premultipliedAlpha: false,
        preserveDrawingBuffer: true, // For renderToBlob
    });

    if (!gl) {
        throw new Error('WebGL2 not supported');
    }

    // Create shaders and program
    const vs = createShader(gl, gl.VERTEX_SHADER, VS_CARD_CANVAS);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, FS_CARD_CANVAS);
    const program = createProgram(gl, vs, fs);

    // Clean up shaders (attached to program, no longer needed)
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    // Get uniform locations
    const uniforms: UniformLocations = {
        u_baseTexture: gl.getUniformLocation(program, 'u_baseTexture'),
        u_distanceField: gl.getUniformLocation(program, 'u_distanceField'),
        u_resolution: gl.getUniformLocation(program, 'u_resolution'),
        u_darknessFactor: gl.getUniformLocation(program, 'u_darknessFactor'),
        u_darkenMode: gl.getUniformLocation(program, 'u_darkenMode'),
        u_darkenThreshold: gl.getUniformLocation(program, 'u_darkenThreshold'),
        u_darkenContrast: gl.getUniformLocation(program, 'u_darkenContrast'),
        u_darkenEdgeWidth: gl.getUniformLocation(program, 'u_darkenEdgeWidth'),
        u_darkenAmount: gl.getUniformLocation(program, 'u_darkenAmount'),
        u_darkenBrightness: gl.getUniformLocation(program, 'u_darkenBrightness'),
        u_brightness: gl.getUniformLocation(program, 'u_brightness'),
        u_contrast: gl.getUniformLocation(program, 'u_contrast'),
        u_saturation: gl.getUniformLocation(program, 'u_saturation'),
        u_sharpness: gl.getUniformLocation(program, 'u_sharpness'),
    };

    // Create quad VAO
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('Failed to create VAO');

    gl.bindVertexArray(vao);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
        1, -1,
        -1, 1,
        1, 1,
    ]), gl.STATIC_DRAW);

    const positionLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);

    return {
        gl,
        program,
        uniforms,
        baseTexture: null,
        distanceTexture: null,
        vao,
    };
}

/**
 * Update uniforms with current render parameters.
 */
function updateUniforms(
    gl: WebGL2RenderingContext,
    uniforms: UniformLocations,
    params: RenderParams,
    darknessFactor: number,
    width: number,
    height: number
): void {
    gl.uniform2f(uniforms.u_resolution, width, height);
    gl.uniform1f(uniforms.u_darknessFactor, darknessFactor);
    gl.uniform1i(uniforms.u_darkenMode, darkenModeToInt(params.darkenMode));
    gl.uniform1f(uniforms.u_darkenThreshold, params.darkenThreshold);
    gl.uniform1f(uniforms.u_darkenContrast, params.darkenContrast);
    gl.uniform1f(uniforms.u_darkenEdgeWidth, params.darkenEdgeWidth);
    gl.uniform1f(uniforms.u_darkenAmount, params.darkenAmount);
    gl.uniform1f(uniforms.u_darkenBrightness, params.darkenBrightness);
    gl.uniform1f(uniforms.u_brightness, params.brightness);
    gl.uniform1f(uniforms.u_contrast, params.contrast);
    gl.uniform1f(uniforms.u_saturation, params.saturation);
    gl.uniform1f(uniforms.u_sharpness, params.sharpness);
}

/**
 * Render the card.
 */
function render(state: WebGLState): void {
    const { gl, vao } = state;

    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
}

/**
 * CardCanvas - WebGL card renderer with real-time adjustments.
 */
export const CardCanvas = memo(function CardCanvas({
    baseTexture,
    distanceField,
    darknessFactor,
    width,
    height,
    params,
    onRender,
    onReady,
    className,
    style,
}: CardCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const stateRef = useRef<WebGLState | null>(null);
    const baseTextureBlobRef = useRef<Blob | null>(null);
    const distanceFieldBlobRef = useRef<Blob | null>(null);
    const paramsRef = useRef<RenderParams>(params);
    const darknessFactorRef = useRef<number>(darknessFactor);
    const dimensionsRef = useRef({ width, height });
    const onRenderRef = useRef(onRender);
    const onReadyRef = useRef(onReady);
    const hasCalledReadyRef = useRef(false);
    const [webglFailed, setWebglFailed] = useState(false);
    const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

    // Keep refs updated
    paramsRef.current = params;
    darknessFactorRef.current = darknessFactor;
    dimensionsRef.current = { width, height };
    onRenderRef.current = onRender;
    onReadyRef.current = onReady;

    // Render function
    const doRender = useCallback(() => {
        const state = stateRef.current;
        const canvas = canvasRef.current;
        if (!state || !canvas || !state.baseTexture) return;

        const { gl, program, uniforms, baseTexture: baseTex, distanceTexture } = state;
        const { width: w, height: h } = dimensionsRef.current;

        // Set canvas size
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
        }

        gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(program);

        // Bind textures
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, baseTex);
        gl.uniform1i(uniforms.u_baseTexture, 0);

        if (distanceTexture) {
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, distanceTexture);
            gl.uniform1i(uniforms.u_distanceField, 1);
        }

        // Update uniforms
        updateUniforms(gl, uniforms, paramsRef.current, darknessFactorRef.current, w, h);

        // Render
        render(state);

        onRenderRef.current?.();
    }, []);

    // Initialize WebGL on mount
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Handle WebGL context loss - browser reclaims context when too many exist
        const handleContextLost = (e: Event) => {
            e.preventDefault();
            console.warn('[CardCanvas] WebGL context lost');
            stateRef.current = null;
        };

        // Handle WebGL context restoration - re-initialize when context is restored
        const handleContextRestored = () => {
            try {
                stateRef.current = initWebGL(canvas);
                // Reset blob refs to force texture reload
                baseTextureBlobRef.current = null;
                distanceFieldBlobRef.current = null;
                // Trigger re-render to reload textures
                doRender();
            } catch (err) {
                console.error('[CardCanvas] WebGL re-init failed:', err);
            }
        };

        canvas.addEventListener('webglcontextlost', handleContextLost);
        canvas.addEventListener('webglcontextrestored', handleContextRestored);

        try {
            stateRef.current = initWebGL(canvas);

            // Reset blob refs to force texture reload on this new WebGL context
            // This is critical for React Strict Mode where refs persist but WebGL context is new
            baseTextureBlobRef.current = null;
            distanceFieldBlobRef.current = null;
        } catch (err) {
            console.error('[CardCanvas] WebGL init failed:', err);
            setWebglFailed(true);
        }

        return () => {
            canvas.removeEventListener('webglcontextlost', handleContextLost);
            canvas.removeEventListener('webglcontextrestored', handleContextRestored);
            // Cleanup
            const state = stateRef.current;
            if (state) {
                const { gl, program, baseTexture, distanceTexture, vao } = state;
                if (baseTexture) gl.deleteTexture(baseTexture);
                if (distanceTexture) gl.deleteTexture(distanceTexture);
                gl.deleteVertexArray(vao);
                gl.deleteProgram(program);
                // Explicitly release WebGL context to avoid hitting browser context limits
                gl.getExtension('WEBGL_lose_context')?.loseContext();
                stateRef.current = null;
            }
        };
    }, [doRender]);

    // Load textures when blobs change
    useEffect(() => {
        const state = stateRef.current;
        if (!state) return;

        const { gl } = state;

        // Load base texture if changed
        if (baseTexture !== baseTextureBlobRef.current) {
            baseTextureBlobRef.current = baseTexture;

            void createTextureFromBlob(gl, baseTexture).then((texture) => {
                // Guard against stale closure (React Strict Mode remount)
                if (stateRef.current !== state) {
                    gl.deleteTexture(texture);
                    return;
                }
                if (state.baseTexture) gl.deleteTexture(state.baseTexture);
                state.baseTexture = texture;
                // Trigger re-render
                doRender();
                // Call onReady once after first successful texture load
                if (!hasCalledReadyRef.current) {
                    hasCalledReadyRef.current = true;
                    onReadyRef.current?.();
                }
            }).catch((err) => {
                console.error('[CardCanvas] Failed to load base texture:', err);
            });
        }

        // Load distance field if changed
        if (distanceField && distanceField !== distanceFieldBlobRef.current) {
            distanceFieldBlobRef.current = distanceField;

            void createTextureFromBlob(gl, distanceField).then((texture) => {
                // Guard against stale closure
                if (stateRef.current !== state) {
                    gl.deleteTexture(texture);
                    return;
                }
                if (state.distanceTexture) gl.deleteTexture(state.distanceTexture);
                state.distanceTexture = texture;
                // Trigger re-render
                doRender();
            });
        }
    }, [baseTexture, distanceField, doRender]);

    // Re-render when params change
    useEffect(() => {
        doRender();
    }, [params, darknessFactor, width, height, doRender]);

    // Create fallback URL when WebGL fails
    useEffect(() => {
        if (webglFailed && baseTexture) {
            const url = URL.createObjectURL(baseTexture);
            setFallbackUrl(url);
            return () => URL.revokeObjectURL(url);
        }
    }, [webglFailed, baseTexture]);

    // Fallback to img when WebGL fails - use CSS filters for approximation
    if (webglFailed) {
        // CSS filter approximation:
        // - brightness: maps -50..+50 to 0.804..1.196 (CSS brightness 1.0 = no change)
        // - contrast: direct (CSS contrast 1.0 = no change)
        // - saturate: direct (CSS saturate 1.0 = no change)
        const cssBrightness = 1 + (params.brightness / 255);
        const cssContrast = params.contrast;
        const cssSaturate = params.saturation;

        const filterStyle = `brightness(${cssBrightness}) contrast(${cssContrast}) saturate(${cssSaturate})`;

        return (
            <img
                src={fallbackUrl ?? undefined}
                alt="Card preview"
                width={width}
                height={height}
                className={className}
                style={{
                    display: 'block',
                    objectFit: 'contain',
                    filter: filterStyle,
                    ...style
                }}
            />
        );
    }

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className={className}
            style={{ display: 'block', ...style }}
        />
    );
});

export default CardCanvas;
