import { CheckSquare, XSquare } from "lucide-react";
import { useSelectionStore } from "../../store/selection";
import { usePageViewSettings } from "../../hooks/usePageViewSettings";
import type { CardOption } from "../../../../shared/types";
import { useMemo } from "react";

interface PageViewSelectionBarProps {
    cards: CardOption[];
    mobile?: boolean;
}

export function PageViewSelectionBar({ cards, mobile }: PageViewSelectionBarProps) {
    const selectedCards = useSelectionStore((state) => state.selectedCards);
    const selectAll = useSelectionStore((state) => state.selectAll);
    const clearSelection = useSelectionStore((state) => state.clearSelection);
    const hasSelection = selectedCards.size > 0;

    const {
        settingsPanelWidth,
        isSettingsPanelCollapsed,
        uploadPanelWidth,
        isUploadPanelCollapsed,
    } = usePageViewSettings();

    const allCardUuids = useMemo(() => cards.map(c => c.uuid), [cards]);

    if (!hasSelection || !cards || cards.length === 0) {
        return null;
    }

    return (
        <div
            className={`fixed z-40 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg flex items-center ${mobile ? 'bottom-20 left-1/2 -translate-x-1/2 landscape:bottom-4 landscape:left-[calc(50%+48px)]' : 'bottom-6'}`}
            style={mobile ? undefined : {
                // On desktop, account for side panels for centering
                left: `calc(50% + ${((isUploadPanelCollapsed ? 60 : uploadPanelWidth) - (isSettingsPanelCollapsed ? 60 : settingsPanelWidth)) / 2}px)`,
                transform: 'translateX(-50%)'
            }}>
            <span className="px-3 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap border-r border-gray-300 dark:border-gray-600">
                {selectedCards.size} selected
            </span>
            <button
                onClick={() => selectAll(allCardUuids)}
                className="px-3 py-3 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-75 active:translate-y-[1px] flex items-center gap-2 border-r border-gray-300 dark:border-gray-600"
                title="Select All"
            >
                <CheckSquare className="size-4" />
                <span className="text-sm hidden sm:inline">Select All</span>
            </button>
            <button
                onClick={clearSelection}
                className="px-3 py-3 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-75 active:translate-y-[1px] flex items-center gap-2"
                title="Deselect All"
            >
                <XSquare className="size-4" />
                <span className="text-sm hidden sm:inline">Deselect</span>
            </button>
        </div>
    );
}
