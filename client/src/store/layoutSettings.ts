/**
 * Layout Settings Store Slice
 * 
 * Extracted from the main settings store for better organization.
 * Re-exports are provided via store/index.ts for backward compatibility.
 * 
 * This slice handles page layout settings:
 * - Page size (preset, width, height, unit)
 * - Page orientation
 * - Columns and rows
 * - Card spacing and position
 * - DPI settings
 */

// Note: This is a future extraction point. For now, these settings
// remain in the main settings.ts to avoid breaking changes.
// 
// When ready to fully extract:
// 1. Move layout-related fields and actions from settings.ts
// 2. Update store/index.ts to re-export
// 3. Use zustand's combine() to merge slices if needed

export const LAYOUT_FIELDS = [
    'pageSizeUnit',
    'pageOrientation',
    'pageSizePreset',
    'pageWidth',
    'pageHeight',
    'customPageWidth',
    'customPageHeight',
    'columns',
    'rows',
    'cardSpacingMm',
    'cardPositionX',
    'cardPositionY',
    'dpi',
] as const;

export type LayoutField = typeof LAYOUT_FIELDS[number];

// Placeholder for future slice implementation
// The actual implementation would be:
//
// export const useLayoutSettingsStore = create<LayoutStore>()(
//   persist(
//     (set) => ({
//       pageSizeUnit: 'in',
//       pageOrientation: 'portrait',
//       pageSizePreset: 'Letter',
//       // ... other layout fields
//     }),
//     { name: 'proxxied:layout-settings:v1' }
//   )
// );
