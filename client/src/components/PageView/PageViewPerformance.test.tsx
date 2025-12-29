
import { render } from "@testing-library/react";
import { PageView } from "./PageView";
import { type Image } from "@/db";
import type { CardOption } from "../../../../shared/types";
import { vi, describe, it, expect, beforeAll } from "vitest";

// Mock matchMedia and ResizeObserver for JSDOM
beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    });

    global.ResizeObserver = class ResizeObserver {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
    };

    Element.prototype.scrollTo = vi.fn();
});

// Mocks
vi.mock("../hooks/useImageProcessing", () => ({
    useImageProcessing: () => ({
        getLoadingState: () => "idle" as const,
        ensureProcessed: vi.fn().mockReturnValue(Promise.resolve()),
    }),
}));

vi.mock("../hooks/usePageViewSettings", () => ({
    usePageViewSettings: () => ({
        pageSizeUnit: "in",
        pageWidth: 8.5,
        pageHeight: 11,
        columns: 3,
        rows: 3,
        zoom: 1,
        setZoom: vi.fn(),
        darkenMode: 'none',
        cardPositionX: 0,
        cardPositionY: 0,
        sourceSettings: { bleed: "none" },
        effectiveBleedWidth: 0,
        dndDisabled: false,
        cardSpacingMm: 0,
    }),
}));

vi.mock("../hooks/useImageCache", () => ({
    useImageCache: () => ({
        processedImageUrls: {
            "img1": "blob:url1",
            "img2": "blob:url2",
            "img3": "blob:url3",
        },
    }),
}));

vi.mock("../hooks/useCardDragAndDrop", () => ({
    useCardDragAndDrop: (props: { cards: CardOption[] }) => ({
        sensors: [],
        localCards: props.cards, // Pass through cards
        activeId: null,
        droppedId: null,
        multiDragState: null,
        handleDragStart: vi.fn(),
        handleDragOver: vi.fn(),
        handleDragEnd: vi.fn(),
        closestCenter: vi.fn(),
    }),
}));

vi.mock("../hooks/usePageViewZoom", () => ({
    usePageViewZoom: () => ({
        scrollContainerRef: { current: null },
        isPinching: false,
        updateCenterOffset: vi.fn(),
    }),
}));

vi.mock("../hooks/useFilteredAndSortedCards", () => ({
    useFilteredAndSortedCards: (cards: CardOption[]) => ({
        cards,
        filteredAndSortedCards: cards,
    }),
}));

vi.mock("../hooks/usePageViewHotkeys", () => ({
    usePageViewHotkeys: vi.fn(),
}));

// Mock selection store hook usage in components
vi.mock("../store", () => {
    const mockSettingsState = {
        guideWidth: 1,
        guideColor: 'black',
        perCardGuideStyle: 'solid',
        guidePlacement: 'outside',
        withBleedSourceAmount: 0,
        withBleedTargetMode: 'none',
        withBleedTargetAmount: 0,
    };
    const mockUseSettingsStore = Object.assign(
        (selector?: (s: typeof mockSettingsState) => unknown) => selector ? selector(mockSettingsState) : mockSettingsState,
        { getState: () => mockSettingsState }
    );
    return {
        useArtworkModalStore: (selector: (s: { openModal: () => void }) => unknown) => selector({ openModal: () => { } }),
        useSettingsStore: mockUseSettingsStore,
        useCardEditorModalStore: (selector: (s: { openModal: () => void; selectedCardUuids: string[] }) => unknown) => selector({ openModal: () => { }, selectedCardUuids: [] }),
    };
});

vi.mock("../store/selection", () => ({
    useSelectionStore: (selector: (s: { selectedCards: Set<string>; toggleSelection: () => void; selectRange: () => void; flippedCards: Set<string>; toggleFlip: () => void }) => unknown) => selector({
        selectedCards: new Set(),
        toggleSelection: vi.fn(),
        selectRange: vi.fn(),
        flippedCards: new Set(),
        toggleFlip: vi.fn(),
    }),
}));

vi.mock("../hooks/useOnScreen", () => ({
    useOnScreen: () => ({ ref: { current: null }, visible: true }),
}));

describe("PageView Performance", () => {
    it("should not re-trigger ensureProcessed on all cards when only one updates", () => {
        const ensureProcessed = vi.fn().mockReturnValue(Promise.resolve());
        // Create getLoadingState that tracks which imageId is loading
        let loadingImageId: string | null = null;
        const getLoadingState = (imageId: string | undefined) => {
            return imageId === loadingImageId ? "loading" as const : "idle" as const;
        };

        const cards: CardOption[] = [
            { uuid: "1", name: "Card 1", imageId: "img1", order: 0, isUserUpload: false },
            { uuid: "2", name: "Card 2", imageId: "img2", order: 1, isUserUpload: false },
            { uuid: "3", name: "Card 3", imageId: "img3", order: 2, isUserUpload: false },
        ];
        const images: Image[] = [];

        const { rerender } = render(
            <PageView
                getLoadingState={getLoadingState}
                ensureProcessed={ensureProcessed}
                cards={cards}
                images={images}
            />
        );

        // Clear initial calls
        ensureProcessed.mockClear();

        // Rerender with NEW props that would cause the suspect re-render loop
        // Referencing the issue: changing images or loadingMap triggers app re-renders.
        // If ensureProcessed is unstable, it causes ALL cards to re-verify.

        // Simulate card 1 going to loading state
        loadingImageId = "img1";

        rerender(
            <PageView
                getLoadingState={getLoadingState}
                ensureProcessed={ensureProcessed}
                cards={cards}
                images={images}
            />
        );

        // With the fix (stable callbacks/refs), ensureProcessed shouldn't be called for cards 2 and 3
        // just because card 1's state updated or the component re-rendered.
        // Note: ensureProcessed dependency in CardCellLazy causes the effect to run.
        expect(ensureProcessed).toHaveBeenCalledTimes(0);
    });
});
