/**
 * Centralized settings serialization for workers.
 * This ensures both display and PDF paths use identical settings.
 */

import type { SourceTypeSettings } from './layout';
import { useSettingsStore } from '../store/settings';

/**
 * Normalized settings for worker consumption.
 * All units are converted to mm for consistency.
 */
interface WorkerBleedSettings {
    // Global bleed toggle and width (always in mm)
    bleedEdge: boolean;
    bleedEdgeWidthMm: number;

    // Source type settings (already normalized)
    sourceSettings: SourceTypeSettings;

    // Source bleed amount for images with built-in bleed (always in mm)
    withBleedSourceAmount: number;

    // Processing options
    darkenMode: 'none' | 'darken-all' | 'contrast-edges' | 'contrast-full';
    darkenThreshold: number;
    darkenContrast: number;
    darkenEdgeWidth: number;
    darkenAmount: number;
    darkenBrightness: number;
    darkenAutoDetect: boolean;
    dpi: number;
}

/**
 * Full settings object for PDF worker.
 * Extends bleed settings with page layout parameters.
 */
export interface WorkerPdfSettings extends WorkerBleedSettings {
    // Page layout
    pageWidth: number;
    pageHeight: number;
    pageSizeUnit: 'mm' | 'in';
    columns: number;
    rows: number;

    // Positioning
    cardSpacingMm: number;
    cardPositionX: number;
    cardPositionY: number;

    // Back-specific positioning
    useCustomBackOffset: boolean;
    cardBackPositionX: number;
    cardBackPositionY: number;
    perCardBackOffsets: Record<number, { x: number; y: number; rotation: number }>;

    // Guide settings
    guideColor: string;
    guideWidthCssPx: number;
    cutLineStyle: 'none' | 'edges' | 'full';
    perCardGuideStyle: 'corners' | 'rounded-corners' | 'dashed-corners' | 'dashed-rounded-corners' | 'solid-rounded-rect' | 'dashed-rounded-rect' | 'solid-squared-rect' | 'dashed-squared-rect' | 'none';
    guidePlacement: 'inside' | 'outside' | 'center';
    cutGuideLengthMm: number;

    // Silhouette registration marks
    registrationMarks: 'none' | '3' | '4';
    registrationMarksPortrait: boolean;

    // Right-align incomplete rows (for backs export)
    rightAlignRows?: boolean;
}

/**
 * Serialize current settings store state to WorkerBleedSettings.
 * Use this for image processing workers.
 */
function serializeBleedSettingsForWorker(): WorkerBleedSettings {
    const state = useSettingsStore.getState();

    // Convert bleed width to mm if needed
    const bleedEdgeWidthMm = state.bleedEdgeUnit === 'in'
        ? state.bleedEdgeWidth * 25.4
        : state.bleedEdgeWidth;

    // Build normalized source settings
    const sourceSettings: SourceTypeSettings = {
        withBleedTargetMode: state.withBleedTargetMode,
        withBleedTargetAmount: state.withBleedTargetAmount,
        noBleedTargetMode: state.noBleedTargetMode,
        noBleedTargetAmount: state.noBleedTargetAmount,
    };

    return {
        bleedEdge: state.bleedEdge,
        bleedEdgeWidthMm,
        sourceSettings,
        withBleedSourceAmount: state.withBleedSourceAmount,
        darkenMode: state.darkenMode,
        darkenThreshold: 30,
        darkenContrast: state.darkenContrast,
        darkenEdgeWidth: state.darkenEdgeWidth,
        darkenAmount: state.darkenAmount,
        darkenBrightness: state.darkenBrightness,
        darkenAutoDetect: state.darkenAutoDetect,
        dpi: state.dpi,
    };
}

/**
 * Serialize current settings store state to WorkerPdfSettings.
 * Use this for PDF export workers.
 */
export function serializePdfSettingsForWorker(): WorkerPdfSettings {
    const state = useSettingsStore.getState();
    const bleedSettings = serializeBleedSettingsForWorker();

    return {
        ...bleedSettings,
        // Page layout
        pageWidth: state.pageWidth,
        pageHeight: state.pageHeight,
        pageSizeUnit: state.pageSizeUnit,
        columns: state.columns,
        rows: state.rows,
        // Positioning
        cardSpacingMm: state.cardSpacingMm,
        cardPositionX: state.cardPositionX,
        cardPositionY: state.cardPositionY,
        // Back-specific positioning
        useCustomBackOffset: state.useCustomBackOffset,
        cardBackPositionX: state.cardBackPositionX,
        cardBackPositionY: state.cardBackPositionY,
        perCardBackOffsets: state.perCardBackOffsets,
        // Guides
        guideColor: state.guideColor,
        guideWidthCssPx: state.guideWidth,
        cutLineStyle: state.cutLineStyle,
        perCardGuideStyle: state.perCardGuideStyle,
        guidePlacement: state.guidePlacement,
        cutGuideLengthMm: state.cutGuideLengthMm,
        registrationMarks: state.registrationMarks,
        registrationMarksPortrait: state.registrationMarksPortrait,
    };
}
