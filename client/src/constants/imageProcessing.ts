/**
 * Image Processing Constants
 * 
 * Centralized constants for image processing, workers, and MPC operations.
 */
export const IMAGE_PROCESSING = {
    /** Base edge zone width in pixels at 300 DPI */
    EDGE_ZONE_BASE_PX: 64,

    /** Standard card height at 300 DPI (88mm = 88/25.4 * 300 ≈ 1039px) */
    STANDARD_CARD_HEIGHT_300DPI: 1039,

    /** Maximum concurrent workers */
    MAX_WORKERS: 8,

    /** Maximum concurrent workers for Firefox (same as default now that context reuse is implemented) */
    MAX_WORKERS_FIREFOX: 8,

    /** Worker idle timeout before termination (ms) */
    WORKER_IDLE_TIMEOUT_MS: 20000,

    /** MPC search chunk size */
    MPC_CHUNK_SIZE: 50,

    /** Number of workers to pre-warm on init */
    PREWARM_WORKER_COUNT: 2,

    /** Standard MTG card dimensions in mm */
    CARD_WIDTH_MM: 63,
    CARD_HEIGHT_MM: 88,

    /** Default MPC bleed in mm (1/8 inch) */
    DEFAULT_MPC_BLEED_MM: 3.175,

    /** Minimum bleed trim amount to bother with (mm) */
    BLEED_TRIM_EPSILON_MM: 0.05,
} as const;

