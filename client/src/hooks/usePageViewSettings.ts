import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useSettingsStore } from "../store/settings";
import { useUserPreferencesStore } from "../store/userPreferences";
import type { SourceTypeSettings } from "../helpers/layout";
import { CONSTANTS } from "@/constants/commonConstants";

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
            darkenMode: state.darkenMode,
            sortBy: state.sortBy,
            filterManaCost: state.filterManaCost,
            filterColors: state.filterColors,
            filterTypes: state.filterTypes,
            filterCategories: state.filterCategories,
            cardPositionX: state.cardPositionX,
            cardPositionY: state.cardPositionY,
            withBleedTargetMode: state.withBleedTargetMode,
            withBleedTargetAmount: state.withBleedTargetAmount,
            noBleedTargetMode: state.noBleedTargetMode,
            noBleedTargetAmount: state.noBleedTargetAmount,
            cardSpacingMm: state.cardSpacingMm,
            guideWidth: state.guideWidth,
            cutLineStyle: state.cutLineStyle,
            perCardGuideStyle: state.perCardGuideStyle,
            guideColor: state.guideColor,
            guidePlacement: state.guidePlacement,
        }))
    );

    const userPrefs = useUserPreferencesStore(
        useShallow((state) => ({
            settingsPanelWidth: state.preferences?.settingsPanelWidth ?? 320,
            isSettingsPanelCollapsed: state.preferences?.isSettingsPanelCollapsed ?? false,
            uploadPanelWidth: state.preferences?.uploadPanelWidth ?? 320,
            isUploadPanelCollapsed: state.preferences?.isUploadPanelCollapsed ?? false,
        }))
    );

    const {
        bleedEdge,
        bleedEdgeUnit,
        bleedEdgeWidth,
        withBleedTargetMode,
        withBleedTargetAmount,
        noBleedTargetMode,
        noBleedTargetAmount,
        sortBy,
        filterManaCost,
        filterColors,
        filterTypes,
        filterCategories,
    } = settings;

    // Build source settings object for computeCardLayouts
    const sourceSettings: SourceTypeSettings = useMemo(() => ({
        withBleedTargetMode,
        withBleedTargetAmount,
        noBleedTargetMode,
        noBleedTargetAmount,
    }), [withBleedTargetMode, withBleedTargetAmount, noBleedTargetMode, noBleedTargetAmount]);

    const effectiveBleedWidth = bleedEdge
        ? (bleedEdgeUnit === 'in' ? bleedEdgeWidth * CONSTANTS.MM_PER_IN : bleedEdgeWidth)
        : 0;

    const dndDisabled =
        sortBy !== "manual" || filterManaCost.length > 0 || filterColors.length > 0 || filterTypes.length > 0 || filterCategories.length > 0;

    const {
        setIsSettingsPanelCollapsed,
        setSettingsPanelWidth,
        setIsUploadPanelCollapsed,
        setUploadPanelWidth
    } = useUserPreferencesStore();

    return {
        ...settings,
        ...userPrefs,
        // Expose setters
        setIsSettingsPanelCollapsed,
        setSettingsPanelWidth,
        setIsUploadPanelCollapsed,
        setUploadPanelWidth,
        toggleSettingsPanel: () => setIsSettingsPanelCollapsed(!userPrefs.isSettingsPanelCollapsed),
        toggleUploadPanel: () => setIsUploadPanelCollapsed(!userPrefs.isUploadPanelCollapsed),

        sourceSettings,
        effectiveBleedWidth,
        dndDisabled,
    };
}
