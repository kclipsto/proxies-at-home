/**
 * Image Processing Constants
 * 
 * Centralized constants for image processing, workers, and MPC operations.
 */
export const CONSTANTS = {
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
    CARD_WIDTH_PX: 63 * 96 / 25.4,
    CARD_HEIGHT_PX: 88 * 96 / 25.4,
    CORNER_RADIUS_MM: 2.5,

    /** Conversion constants */
    MM_PER_IN: 25.4,
    DISPLAY_MM_TO_PX: 96 / 25.4,

    /** Layout constants */
    PAGE_GAP_PX: 16,
    MAX_BROWSER_DIMENSION: 16384,

    /** DPI values */
    CANVAS_DPI: 72,
    SCREEN_DPI: 96,
    DEFAULT_DISPLAY_DPI: 300,

    /** Default MPC bleed in mm (1/8 inch) */
    DEFAULT_MPC_BLEED_MM: 3.175,

    /** Minimum bleed trim amount to bother with (mm) */
    BLEED_TRIM_EPSILON_MM: 0.05,
} as const;

export const IN_TO_PX = (inches: number, dpi: number) => Math.round(inches * dpi);
const MM_TO_IN = (mm: number) => mm / CONSTANTS.MM_PER_IN;
export const MM_TO_PX = (mm: number, dpi: number) => IN_TO_PX(MM_TO_IN(mm), dpi);
