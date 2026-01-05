/**
 * Helper for making settings changes undoable with debouncing.
 * Only records initial and final states, not intermediate steps.
 */

import { useUndoRedoStore } from "@/store/undoRedo";
import { useSettingsStore } from "@/store/settings";

// Keys that should be tracked for undo (excludes UI state like panel widths)
export type UndoableSettingKey =
    | "pageSizePreset"
    | "pageOrientation"
    | "columns"
    | "rows"
    | "bleedEdgeWidth"
    | "bleedEdge"
    | "darkenMode"
    | "guideColor"
    | "guideWidth"
    | "cardSpacingMm"
    | "cardPositionX"
    | "cardPositionY"
    | "dpi"
    | "cutLineStyle"
    | "perCardGuideStyle"
    | "guidePlacement"
    | "globalLanguage"
    | "sortBy"
    | "sortOrder"
    | "filterManaCost"
    | "filterColors"
    | "filterTypes"
    | "filterCategories"
    | "filterFeatures"
    | "filterMatchType"
    | "bleedEdgeUnit"
    | "withBleedSourceAmount"
    | "withBleedTargetMode"
    | "withBleedTargetAmount"
    | "noBleedTargetMode"
    | "noBleedTargetAmount"
    | "darkenContrast"
    | "darkenEdgeWidth"
    | "darkenAmount"
    | "darkenBrightness"
    | "darkenAutoDetect"
    | "cutGuideLengthMm";

// Human-readable descriptions for each setting
const settingDescriptions: Record<UndoableSettingKey, string> = {
    pageSizePreset: "page size",
    pageOrientation: "page orientation",
    columns: "columns",
    rows: "rows",
    bleedEdgeWidth: "bleed width",
    bleedEdge: "bleed edge",
    darkenMode: "darken mode",
    guideColor: "guide color",
    guideWidth: "guide width",
    cardSpacingMm: "card spacing",
    cardPositionX: "card position X",
    cardPositionY: "card position Y",
    dpi: "DPI",
    cutLineStyle: "cut line style",
    perCardGuideStyle: "per-card guide style",
    guidePlacement: "guide placement",
    globalLanguage: "language",
    sortBy: "sort by",
    sortOrder: "sort order",
    filterManaCost: "mana cost filter",
    filterColors: "color filter",
    filterTypes: "type filter",
    filterCategories: "category filter",
    filterFeatures: "feature filter",
    filterMatchType: "filter match type",
    bleedEdgeUnit: "bleed unit",
    withBleedSourceAmount: "provided bleed amount",
    withBleedTargetMode: "bleed generation mode",
    withBleedTargetAmount: "target bleed width",
    noBleedTargetMode: "bleed generation mode",
    noBleedTargetAmount: "target bleed width",
    darkenContrast: "darken contrast",
    darkenEdgeWidth: "darken edge width",
    darkenAmount: "darken amount",
    darkenBrightness: "darken brightness",
    darkenAutoDetect: "auto detect darkness",
    cutGuideLengthMm: "cut guide length",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SettingValue = any;

// Track pending changes per setting for debouncing
interface PendingChange {
    initialValue: SettingValue;
    timeoutId: ReturnType<typeof setTimeout>;
}

const pendingChanges = new Map<UndoableSettingKey, PendingChange>();

// Debounce delay in milliseconds
const DEBOUNCE_DELAY = 500;

/**
 * Commits a pending change as an undoable action.
 */
function commitPendingChange(key: UndoableSettingKey): void {
    const pending = pendingChanges.get(key);
    if (!pending) return;

    pendingChanges.delete(key);

    // Get current value from store
    const currentValue = useSettingsStore.getState()[key];

    // Don't record if value hasn't actually changed
    if (JSON.stringify(pending.initialValue) === JSON.stringify(currentValue)) return;

    const description = settingDescriptions[key] || key;
    const setterName = `set${key.charAt(0).toUpperCase()}${key.slice(1)}` as keyof ReturnType<typeof useSettingsStore.getState>;

    useUndoRedoStore.getState().pushAction({
        type: "CHANGE_SETTING",
        description: `Change ${description}`,
        undo: async () => {
            const setter = useSettingsStore.getState()[setterName];
            if (typeof setter === "function") {
                (setter as (value: SettingValue) => void)(pending.initialValue);
            }
        },
        redo: async () => {
            const setter = useSettingsStore.getState()[setterName];
            if (typeof setter === "function") {
                (setter as (value: SettingValue) => void)(currentValue);
            }
        },
    });
}

/**
 * Records a setting change with debouncing.
 * Only records initial and final states, not intermediate steps.
 */
export function recordSettingChange(
    key: UndoableSettingKey,
    oldValue: SettingValue
): void {
    // Don't record during undo/redo operations
    if (useUndoRedoStore.getState().isPerformingAction) return;

    const existing = pendingChanges.get(key);

    if (existing) {
        // Already tracking this setting - just reset the debounce timer
        clearTimeout(existing.timeoutId);
        existing.timeoutId = setTimeout(() => commitPendingChange(key), DEBOUNCE_DELAY);
    } else {
        // New change - capture the initial value and start debounce
        const timeoutId = setTimeout(() => commitPendingChange(key), DEBOUNCE_DELAY);
        pendingChanges.set(key, {
            initialValue: oldValue,
            timeoutId,
        });
    }
}

/**
 * Immediately commits any pending change for a setting.
 * Call this on blur or when navigating away.
 */


/**
 * Creates undoable setter wrappers for use in React components.
 */

