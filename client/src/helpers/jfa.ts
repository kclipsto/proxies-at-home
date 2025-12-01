export function applyJFA(imageData: ImageData, seedThreshold = 250, fillThreshold = 240) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const size = width * height;

    // Seeds array: stores the coordinates (x, y) of the nearest valid pixel.
    // We use a single Int32Array where index 2*i is x and 2*i+1 is y.
    // Initialize with -1 (no seed).
    const seeds = new Int32Array(size * 2).fill(-1);

    // 1. Initialization Step
    let x = 0;
    let y = 0;
    for (let i = 0; i < size; i++) {
        const alpha = data[i * 4 + 3];
        // Only treat pixels as valid seeds if they are opaque enough.
        if (alpha > seedThreshold) {
            const base = i * 2;
            seeds[base] = x;
            seeds[base + 1] = y;
        }

        x++;
        if (x === width) {
            x = 0;
            y++;
        }
    }

    // 2. Jump Flooding Step
    const maxDim = Math.max(width, height);
    let step = Math.pow(2, Math.floor(Math.log2(maxDim)));

    while (step >= 1) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const currentIdx = y * width + x;
                const currentBase = currentIdx * 2;

                let bestSeedX = seeds[currentBase];
                let bestSeedY = seeds[currentBase + 1];

                let minDist = Infinity;

                if (bestSeedX !== -1) {
                    const dx = x - bestSeedX;
                    const dy = y - bestSeedY;
                    minDist = dx * dx + dy * dy;
                }

                // Check 8 neighbors
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;

                        const nx = x + dx * step;
                        const ny = y + dy * step;

                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const neighborIdx = ny * width + nx;
                            const neighborBase = neighborIdx * 2;
                            const neighborSeedX = seeds[neighborBase];
                            const neighborSeedY = seeds[neighborBase + 1];

                            if (neighborSeedX !== -1) {
                                const distX = x - neighborSeedX;
                                const distY = y - neighborSeedY;
                                const d = distX * distX + distY * distY;

                                if (d < minDist) {
                                    minDist = d;
                                    bestSeedX = neighborSeedX;
                                    bestSeedY = neighborSeedY;
                                }
                            }
                        }
                    }
                }
                seeds[currentBase] = bestSeedX;
                seeds[currentBase + 1] = bestSeedY;
            }
        }
        step /= 2;
    }

    // 3. Colorization Step
    for (let i = 0; i < size; i++) {
        const base = i * 2;
        const seedX = seeds[base];
        const seedY = seeds[base + 1];

        if (seedX !== -1) {
            // Only fill pixels that are considered "empty" or "transparent enough"
            if (data[i * 4 + 3] <= fillThreshold) {
                const seedIdx = seedY * width + seedX;
                const seedPixelBase = seedIdx * 4;
                const targetPixelBase = i * 4;

                data[targetPixelBase] = data[seedPixelBase];         // R
                data[targetPixelBase + 1] = data[seedPixelBase + 1]; // G
                data[targetPixelBase + 2] = data[seedPixelBase + 2]; // B
                data[targetPixelBase + 3] = 255;                     // A
            }
        }
    }
}
