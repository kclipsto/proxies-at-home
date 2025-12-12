import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useSettingsStore } from "../store/settings";
import type { SourceTypeSettings } from "../helpers/layout";

export function usePageViewSettings() {
    const settings = useSettingsStore(
        useShallow((state) => ({
            pageSizeUnit: state.pageSizeUnit,
            pageWidth: state.pageWidth,
            pageHeight: state.pageHeight,
            columns: state.columns,
            rows: state.rows,
            bleedEdge: state.bleedEdge,
            bleedEdgeWidth: state.bleedEdgeWidth,
            bleedEdgeUnit: state.bleedEdgeUnit,
            zoom: state.zoom,
            setZoom: state.setZoom,
            settingsPanelWidth: state.settingsPanelWidth,
            isSettingsPanelCollapsed: state.isSettingsPanelCollapsed,
            uploadPanelWidth: state.uploadPanelWidth,
            isUploadPanelCollapsed: state.isUploadPanelCollapsed,
            darkenNearBlack: state.darkenNearBlack,
            sortBy: state.sortBy,
            filterManaCost: state.filterManaCost,
            filterColors: state.filterColors,
            cardPositionX: state.cardPositionX,
            cardPositionY: state.cardPositionY,
            mpcBleedMode: state.mpcBleedMode,
            mpcExistingBleed: state.mpcExistingBleed,
            mpcExistingBleedUnit: state.mpcExistingBleedUnit,
            uploadBleedMode: state.uploadBleedMode,
            uploadExistingBleed: state.uploadExistingBleed,
            uploadExistingBleedUnit: state.uploadExistingBleedUnit,
            cardSpacingMm: state.cardSpacingMm,
        }))
    );

    const {
        bleedEdge,
        bleedEdgeUnit,
        bleedEdgeWidth,
        mpcBleedMode,
        mpcExistingBleed,
        mpcExistingBleedUnit,
        uploadBleedMode,
        uploadExistingBleed,
        uploadExistingBleedUnit,
        sortBy,
        filterManaCost,
        filterColors,
    } = settings;

    // Build source settings object for computeCardLayouts
    const sourceSettings: SourceTypeSettings = useMemo(() => ({
        mpcBleedMode,
        mpcExistingBleed,
        mpcExistingBleedUnit,
        uploadBleedMode,
        uploadExistingBleed,
        uploadExistingBleedUnit,
    }), [mpcBleedMode, mpcExistingBleed, mpcExistingBleedUnit, uploadBleedMode, uploadExistingBleed, uploadExistingBleedUnit]);

    const effectiveBleedWidth = bleedEdge
        ? (bleedEdgeUnit === 'in' ? bleedEdgeWidth * 25.4 : bleedEdgeWidth)
        : 0;

    const dndDisabled =
        sortBy !== "manual" || filterManaCost.length > 0 || filterColors.length > 0;

    return {
        ...settings,
        sourceSettings,
        effectiveBleedWidth,
        dndDisabled,
    };
}
