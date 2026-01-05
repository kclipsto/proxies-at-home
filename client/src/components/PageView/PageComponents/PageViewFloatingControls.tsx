import { useRef, useState, useEffect } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { ZoomControls } from "../ZoomControls";
import { UndoRedoControls } from "../UndoRedoControls";
import { FloatingZoomPanel } from "../../common";
import { useSettingsStore } from "@/store/settings";
import { usePageViewSettings } from "@/hooks/usePageViewSettings";
import { useOnClickOutside } from "@/hooks/useOnClickOutside";
import { useCardEditorModalStore } from "@/store";

interface PageViewFloatingControlsProps {
    mobile?: boolean;
    hasCards: boolean;
}

export function PageViewFloatingControls({ mobile, hasCards }: PageViewFloatingControlsProps) {
    const {
        settingsPanelWidth,
        isSettingsPanelCollapsed,
        uploadPanelWidth,
        isUploadPanelCollapsed,
    } = usePageViewSettings();

    const globalZoom = useSettingsStore((state) => state.zoom);
    const globalSetZoom = useSettingsStore((state) => state.setZoom);

    // Hide floating controls when CardEditorModal is open
    const isCardEditorOpen = useCardEditorModalStore((state) => state.open);

    const [showMobileZoomControls, setShowMobileZoomControls] = useState(false);
    const mobileZoomControlsRef = useRef<HTMLDivElement>(null);
    useOnClickOutside(mobileZoomControlsRef, () => setShowMobileZoomControls(false));

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (showMobileZoomControls && mobileZoomControlsRef.current) {
                if (!mobileZoomControlsRef.current.contains(e.target as Node)) {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowMobileZoomControls(false);
                }
            }
        };

        if (showMobileZoomControls) {
            window.addEventListener("click", handler, true);
        }

        return () => window.removeEventListener("click", handler, true);
    }, [showMobileZoomControls]);


    // Hide when no cards or when card editor modal is open
    if (!hasCards || isCardEditorOpen) return null;

    return (
        <>
            {/* Floating Zoom Controls - Desktop Only */}
            {!mobile && (
                <FloatingZoomPanel
                    zoom={globalZoom}
                    onZoomChange={globalSetZoom}
                    minZoom={0.1}
                    maxZoom={5}
                    position="bottom-right"
                    className="fixed bottom-6"
                    style={{
                        right: `${(isSettingsPanelCollapsed ? 60 : settingsPanelWidth) + 20}px`
                    }}
                />
            )}

            {/* Floating Undo/Redo Controls - Desktop Only */}
            {!mobile && (
                <div
                    className="fixed bottom-6 z-40"
                    style={{
                        left: `${(isUploadPanelCollapsed ? 60 : uploadPanelWidth) + 20}px`
                    }}
                >
                    <UndoRedoControls />
                </div>
            )}

            {/* Mobile Zoom Controls */}
            {mobile && (
                <div
                    ref={mobileZoomControlsRef}
                    className="fixed bottom-20 right-4 landscape:bottom-4 landscape:right-4 z-9999 flex flex-col items-end gap-2"
                >
                    {showMobileZoomControls && (
                        <div className="bg-white dark:bg-gray-800 p-2 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-64 mb-2">
                            <ZoomControls />
                        </div>
                    )}
                    <button
                        onClick={() => setShowMobileZoomControls(!showMobileZoomControls)}
                        className="p-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg text-gray-600 dark:text-gray-400"
                    >
                        {showMobileZoomControls ? <ZoomOut className="size-5" /> : <ZoomIn className="size-5" />}
                    </button>
                </div>
            )}

            {/* Mobile Undo/Redo Controls */}
            {mobile && (
                <div className="fixed bottom-20 left-4 landscape:bottom-4 landscape:left-24 z-9999">
                    <UndoRedoControls />
                </div>
            )}
        </>
    );
}
