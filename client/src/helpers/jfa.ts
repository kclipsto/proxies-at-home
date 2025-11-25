export function applyJFA(imageData: ImageData, seedThreshold = 250, fillThreshold = 240) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const size = width * height;

    // Seeds array: stores the index of the nearest valid pixel.
    // Initialize with -1 (no seed).
    const seeds = new Int32Array(size).fill(-1);

    // 1. Initialization Step
    for (let i = 0; i < size; i++) {
        const alpha = data[i * 4 + 3];
        // Only treat pixels as valid seeds if they are opaque enough.
        // This avoids spreading semi-transparent edge pixels (anti-aliasing) into the bleed.
        if (alpha > seedThreshold) {
            seeds[i] = i;
        }
    }

    // 2. Jump Flooding Step
    // We need to iterate with step size k, starting from roughly half the largest dimension
    // down to 1.
    const maxDim = Math.max(width, height);
    let step = Math.pow(2, Math.floor(Math.log2(maxDim)));

    // Helper to get distance squared between two pixel indices
    const distSq = (idx1: number, idx2: number) => {
        const x1 = idx1 % width;
        const y1 = Math.floor(idx1 / width);
        const x2 = idx2 % width;
        const y2 = Math.floor(idx2 / width);
        return (x1 - x2) ** 2 + (y1 - y2) ** 2;
    };

    while (step >= 1) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const currentIdx = y * width + x;
                let bestSeed = seeds[currentIdx];
                let minDist = bestSeed === -1 ? Infinity : distSq(currentIdx, bestSeed);

                // Check 8 neighbors + center (center is already current bestSeed)
                // Neighbors at (x + dx, y + dy) where dx, dy in {-1, 0, 1} * step
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;

                        const nx = x + dx * step;
                        const ny = y + dy * step;

                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const neighborIdx = ny * width + nx;
                            const neighborSeed = seeds[neighborIdx];

                            if (neighborSeed !== -1) {
                                const d = distSq(currentIdx, neighborSeed);
                                if (d < minDist) {
                                    minDist = d;
                                    bestSeed = neighborSeed;
                                }
                            }
                        }
                    }
                }
                seeds[currentIdx] = bestSeed;
            }
        }
        step /= 2;
    }

    // 3. Colorization Step
    for (let i = 0; i < size; i++) {
        const seedIdx = seeds[i];

        if (seedIdx !== -1) {
            // Only fill pixels that are considered "empty" or "transparent enough" to be part of the bleed.
            // We use a lower threshold here to ensure we fill even slightly transparent pixels that might be
            // part of the anti-aliased edge but weren't good enough to be seeds.
            if (data[i * 4 + 3] <= fillThreshold) {
                const seedBase = seedIdx * 4;
                data[i * 4] = data[seedBase];     // R
                data[i * 4 + 1] = data[seedBase + 1]; // G
                data[i * 4 + 2] = data[seedBase + 2]; // B
                data[i * 4 + 3] = 255;            // A (Full opacity for bleed)
            }
        }
    }
}
