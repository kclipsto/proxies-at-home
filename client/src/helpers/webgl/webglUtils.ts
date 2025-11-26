
export function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Failed to create shader");

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Failed to compile shader: ${info}`);
    }

    return shader;
}

export function createProgram(gl: WebGL2RenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram {
    const program = gl.createProgram();
    if (!program) throw new Error("Failed to create program");

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`Failed to link program: ${info}`);
    }

    return program;
}

export function createTexture(gl: WebGL2RenderingContext, width: number, height: number, data: ArrayBufferView | ImageBitmap | null = null, internalFormat: number = gl.RGBA8, format: number = gl.RGBA, type: number = gl.UNSIGNED_BYTE): WebGLTexture {
    const texture = gl.createTexture();
    if (!texture) throw new Error("Failed to create texture");

    gl.bindTexture(gl.TEXTURE_2D, texture);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, data as any); // Cast data to any to satisfy overloads
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return texture;
}

export function createFramebuffer(gl: WebGL2RenderingContext, texture: WebGLTexture): WebGLFramebuffer {
    const fb = gl.createFramebuffer();
    if (!fb) throw new Error("Failed to create framebuffer");

    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error("Framebuffer is not complete");
    }

    return fb;
}

export function createQuadBuffer(gl: WebGL2RenderingContext): WebGLBuffer {
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error("Failed to create buffer");

    // Full screen quad (-1 to 1)
    // Note: To fix mirroring, we might need to adjust UVs or vertices.
    // Standard quad: (-1,-1) -> (0,0), (1,1) -> (1,1)
    // If image is mirrored, it means left is right.
    // Let's check the vertex shader again.
    // v_uv = a_position * 0.5 + 0.5;
    // (-1) * 0.5 + 0.5 = 0. (Left)
    // (1) * 0.5 + 0.5 = 1. (Right)
    // This seems correct for non-mirrored.
    // However, if the user says it's mirrored, maybe the source image is being drawn backwards?
    // Or maybe the texture coordinates are flipped?
    // Let's try flipping X in the quad vertices for UV calculation?
    // Or just flip X in the vertex shader?
    // Let's stick to standard quad and see if UNPACK_FLIP_Y fixes the "mirrored" perception (sometimes 180 rotation looks like mirror + flip).
    // Flipping X coordinates of the quad to potentially fix mirroring.
    const vertices = new Float32Array([
        -1, -1,
        1, -1,
        -1, 1,
        -1, 1,
        1, -1,
        1, 1,
    ]);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    return buffer;
}
