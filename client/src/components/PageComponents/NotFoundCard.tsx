import { memo } from "react";
import { Check } from "lucide-react";
import { useSelectionStore } from "../../store/selection";
import { useArtworkModalStore } from "../../store/artworkModal";
import type { CardOption } from "../../../../shared/types";

interface NotFoundCardProps {
    card: CardOption;
    globalIndex: number;
    onRangeSelect?: (index: number) => void;
    cardWidthMm: number;
    cardHeightMm: number;
    setContextMenu: (menu: { visible: boolean; x: number; y: number; cardUuid: string }) => void;
}

export const NotFoundCard = memo(function NotFoundCard({
    card,
    globalIndex,
    onRangeSelect,
    cardWidthMm,
    cardHeightMm,
    setContextMenu,
}: NotFoundCardProps) {
    // Subscribe to selection state directly - only this component re-renders when selection changes
    const isSelected = useSelectionStore((state) => state.selectedCards.has(card.uuid));
    const hasAnySelection = useSelectionStore((state) => state.selectedCards.size > 0);
    const toggleSelection = useSelectionStore((state) => state.toggleSelection);
    // selectRange handled by parent via onRangeSelect
    const openArtworkModal = useArtworkModalStore((state) => state.openModal);

    return (
        <div
            className="relative flex items-center justify-center group"
            style={{
                width: `${cardWidthMm}mm`,
                height: `${cardHeightMm}mm`,
                justifySelf: 'center',
                alignSelf: 'center',
            }}
        >
            <div
                onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({
                        visible: true,
                        x: e.clientX,
                        y: e.clientY,
                        cardUuid: card.uuid,
                    });
                }}
                onClick={(e) => {
                    // Shift+click for range selection
                    if (e.shiftKey && onRangeSelect) {
                        e.preventDefault();
                        onRangeSelect(globalIndex);
                        return;
                    }
                    // Ctrl/Cmd+click for toggle selection
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        toggleSelection(card.uuid);
                        return;
                    }
                    // Normal click opens modal
                    openArtworkModal({
                        card,
                        index: globalIndex,
                    });
                }}
                className="flex items-center justify-center border-2 border-dashed border-red-500 dark:border-red-400 bg-gray-100 dark:bg-gray-800 text-center p-2 select-none w-full h-full cursor-pointer rounded-xl"
                style={{
                    boxSizing: "border-box",
                }}
                title={`"${card.name}" not found - click to replace`}
            >
                <div>
                    <div className="font-semibold text-red-700 dark:text-red-400">
                        "{card.name}"
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                        Couldn't find card, click to replace
                    </div>
                </div>
            </div>

            {/* Selection Overlay */}
            {isSelected && (
                <div className="absolute inset-0 bg-blue-500/30 pointer-events-none z-10 border-4 border-blue-500 rounded-xl" />
            )}

            {/* Selection Checkbox */}
            <div
                className={`absolute left-1 top-1 w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer z-20 transition-opacity pointer-events-auto ${isSelected
                    ? 'bg-blue-600 border-blue-600 opacity-100'
                    : hasAnySelection
                        ? 'bg-white/80 border-gray-400 opacity-100'
                        : 'bg-white/80 border-gray-400 opacity-0 group-hover:opacity-100'
                    }`}
                onClick={(e) => {
                    e.stopPropagation();
                    if (e.shiftKey && onRangeSelect) {
                        onRangeSelect(globalIndex);
                    } else {
                        toggleSelection(card.uuid);
                    }
                }}
            >
                {isSelected && <Check size={14} className="text-white" />}
            </div>
        </div>
    );
});
