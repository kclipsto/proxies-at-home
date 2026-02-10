import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { CardEditorModalWrapper } from './CardEditorModalWrapper';
import { useCardEditorModalStore, type CardEditorModalStore } from '@/store';
import type { CardOption } from '@/types';
import type { Image } from '@/db';
import { useSettingsStore, type Store } from '@/store/settings';
import { db } from '@/db';
import { useLiveQuery } from 'dexie-react-hooks';
import * as effectCache from '@/helpers/effectCache';

// Mocks
vi.mock('@/store', () => ({
    useCardEditorModalStore: vi.fn(),
}));

vi.mock('@/store/settings', () => ({
    useSettingsStore: vi.fn(),
}));

vi.mock('dexie-react-hooks', () => ({
    useLiveQuery: vi.fn(),
}));

vi.mock('@/db', () => ({
    db: {
        cards: {
            get: vi.fn(),
            update: vi.fn(),
            toArray: vi.fn(),
            bulkPut: vi.fn(),
            where: vi.fn(() => ({
                anyOf: vi.fn(() => ({
                    toArray: vi.fn(),
                })),
            })),
        },
        images: {
            get: vi.fn(),
            bulkGet: vi.fn(),
        },
        cardbacks: {
            get: vi.fn(),
        },
        transaction: vi.fn((_mode, _tables, cb) => cb()),
    },
}));

vi.mock('./CardEditorModal', () => ({
    CardEditorModal: (props: {
        onApply: (uuid: string, overrides: unknown) => void;
        onApplyToAll: (overrides: unknown) => void;
        onApplyToSelected: (uuids: string[], overrides: unknown) => void;
        onClose: () => void;
        card: { uuid: string };
    }) => (
        <div data-testid="card-editor-modal">
            <button onClick={() => props.onApply(props.card.uuid, { brightness: 1.5 })}>Apply</button>
            <button onClick={() => props.onApplyToAll({ brightness: 1.5 })}>Apply All</button>
            <button onClick={() => props.onApplyToSelected(['uuid1', 'uuid2'], { brightness: 1.5 })}>Apply Selected</button>
            <button onClick={props.onClose}>Close</button>
        </div>
    ),
}));

vi.mock('@/helpers/effectCache', () => ({
    preRenderEffect: vi.fn().mockResolvedValue(undefined),
    queueBulkPreRender: vi.fn(),
    destroyEffectProcessor: vi.fn(),
}));

vi.mock('@/helpers/adjustmentUtils', () => ({
    hasActiveAdjustments: vi.fn().mockReturnValue(true),
}));

describe('CardEditorModalWrapper', () => {
    const mockStoreData: CardEditorModalStore = {
        open: true,
        card: { uuid: 'test-uuid', imageId: 'test-img', name: 'Test Card', order: 0, isUserUpload: false } as unknown as CardOption,
        image: { id: 'test-img' } as unknown as Image,
        backCard: { uuid: 'back-uuid', imageId: 'back-img', name: 'Back Card', order: 1, isUserUpload: false } as unknown as CardOption,
        backImage: null,
        selectedCardUuids: ['test-uuid'],
        initialFace: 'front',
        closeModal: vi.fn(),
        openModal: vi.fn(),
    };

    const mockModalStore = vi.mocked(useCardEditorModalStore);
    const mockSettingsStore = vi.mocked(useSettingsStore);
    const mockLiveQuery = vi.mocked(useLiveQuery);

    beforeEach(() => {
        vi.clearAllMocks();
        mockModalStore.mockImplementation((selector: (state: typeof mockStoreData) => unknown) => selector(mockStoreData));
        mockSettingsStore.mockImplementation((selector: (state: Store) => unknown) => selector({ dpi: 300 } as unknown as Store));
    });

    it('should render nothing if card is missing (loading state)', () => {
        // Ensure store has no card so fallback doesn't happen
        mockModalStore.mockImplementation((selector: (state: typeof mockStoreData) => unknown) => selector({
            ...mockStoreData,
            card: null
        }));
        mockLiveQuery.mockReturnValue(undefined); // Simulate loading
        const { container } = render(<CardEditorModalWrapper />);
        expect(container).toBeEmptyDOMElement();
    });

    it('should render modal when data is loaded', () => {
        // Mock live queries returning data in order:
        mockLiveQuery
            .mockReturnValueOnce({ uuid: 'test-uuid', imageId: 'test-img' })
            .mockReturnValueOnce({ id: 'test-img' })
            .mockReturnValueOnce({ uuid: 'back-uuid', imageId: 'back-img' })
            .mockReturnValueOnce({ id: 'back-img' });

        render(<CardEditorModalWrapper />);
        expect(screen.getByTestId('card-editor-modal')).toBeInTheDocument();
    });

    it('should handle apply actions', async () => {
        mockLiveQuery
            .mockReturnValueOnce({ uuid: 'test-uuid', imageId: 'test-img' })
            .mockReturnValueOnce({ id: 'test-img', exportBlob: new Blob([]) })
            .mockReturnValueOnce(undefined)
            .mockReturnValueOnce(undefined);

        (db.cards.get as Mock).mockResolvedValue({ uuid: 'test-uuid', imageId: 'test-img' });
        (db.images.get as Mock).mockResolvedValue({ id: 'test-img', exportBlob: new Blob([]) });

        render(<CardEditorModalWrapper />);

        const applyBtn = screen.getByText('Apply');
        await act(async () => {
            applyBtn.click();
        });

        expect(db.cards.update).toHaveBeenCalledWith('test-uuid', { overrides: { brightness: 1.5 } });
        expect(effectCache.preRenderEffect).toHaveBeenCalled();
    });

    it('should handle apply all', async () => {
        mockLiveQuery
            .mockReturnValueOnce({ uuid: 'test-uuid', imageId: 'test-img' })
            .mockReturnValueOnce({ id: 'test-img' })
            .mockReturnValueOnce(undefined)
            .mockReturnValueOnce(undefined);

        const mockCards = [
            { uuid: '1', imageId: 'img1' },
            { uuid: '2', imageId: 'img2' }
        ];
        (db.cards.toArray as Mock).mockResolvedValue(mockCards);
        (db.images.bulkGet as Mock).mockResolvedValue([{ id: 'img1', exportBlob: {} }, { id: 'img2', exportBlob: {} }]);

        render(<CardEditorModalWrapper />);

        const applyAllBtn = screen.getByText('Apply All');
        await act(async () => {
            applyAllBtn.click();
        });

        expect(db.cards.bulkPut).toHaveBeenCalledWith([
            { uuid: '1', imageId: 'img1', overrides: { brightness: 1.5 } },
            { uuid: '2', imageId: 'img2', overrides: { brightness: 1.5 } }
        ]);

        // Wait for setTimeout
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(effectCache.queueBulkPreRender).toHaveBeenCalled();
    });

    it('should handle apply selected', async () => {
        mockLiveQuery
            .mockReturnValueOnce({ uuid: 'test-uuid', imageId: 'test-img' })
            .mockReturnValueOnce({ id: 'test-img' })
            .mockReturnValueOnce(undefined)
            .mockReturnValueOnce(undefined);

        const mockCards = [
            { uuid: 'uuid1', imageId: 'img1' },
            { uuid: 'uuid2', imageId: 'img2' }
        ];
        // Mock where().anyOf().toArray() chain
        (db.cards.where as Mock).mockReturnValue({
            anyOf: vi.fn().mockReturnValue({
                toArray: vi.fn().mockResolvedValue(mockCards)
            })
        });
        (db.images.bulkGet as Mock).mockResolvedValue([{ id: 'img1', exportBlob: {} }, { id: 'img2', exportBlob: {} }]);

        render(<CardEditorModalWrapper />);

        const applySelectedBtn = screen.getByText('Apply Selected');
        await act(async () => {
            applySelectedBtn.click();
        });

        expect(db.cards.bulkPut).toHaveBeenCalledWith([
            { uuid: 'uuid1', imageId: 'img1', overrides: { brightness: 1.5 } },
            { uuid: 'uuid2', imageId: 'img2', overrides: { brightness: 1.5 } }
        ]);

        await new Promise(resolve => setTimeout(resolve, 10));
        expect(effectCache.queueBulkPreRender).toHaveBeenCalled();
    });

    describe('Back Image Logic', () => {
        it('should load back image from images table', async () => {
            let backImageCb: (() => Promise<unknown>) | undefined;
            let callCount = 0;

            mockLiveQuery.mockImplementation((((cb: () => Promise<unknown>) => {
                callCount++;
                if (callCount === 1) return { uuid: 'test-uuid', imageId: 'test-id' };
                if (callCount === 2) return { id: 'test-id' };
                if (callCount === 3) return { uuid: 'back-uuid', imageId: 'back-img-id' };
                if (callCount === 4) {
                    backImageCb = cb;
                    return undefined;
                }
                return undefined;
            }) as typeof useLiveQuery));

            render(<CardEditorModalWrapper />);

            expect(backImageCb).toBeDefined();
            if (!backImageCb) return;

            // 1. Test image found in images table
            (db.images.get as Mock).mockResolvedValue({ id: 'back-img-1' });
            const result1 = await backImageCb();
            expect(result1).toEqual({ id: 'back-img-1' });

            // 2. Test fallback to cardbacks table
            (db.images.get as Mock).mockResolvedValue(undefined);
            (db.cardbacks.get as Mock).mockResolvedValue({
                id: 'cb-1',
                displayBlob: 'blob1',
                exportBlob: 'blob2'
            });

            const result2 = await backImageCb();
            expect(result2).toEqual(expect.objectContaining({
                id: 'cb-1',
                displayBlob: 'blob1',
                baseDisplayBlob: 'blob1',
                displayDpi: 300
            }));

            // 3. Test nothing found
            (db.cardbacks.get as Mock).mockResolvedValue(undefined);
            const result3 = await backImageCb();
            expect(result3).toBeUndefined();
        });
    });

    describe('Null/undefined branch coverage', () => {
        it('should handle null storeCard in live query', () => {
            // Setup store to not have a card
            mockModalStore.mockImplementation((selector: (state: typeof mockStoreData) => unknown) => selector({
                ...mockStoreData,
                card: null,
                backCard: undefined,
            }));

            // Execute each live query callback to simulate the undefined path
            const queryCallbacks: Array<() => Promise<unknown> | unknown> = [];
            mockLiveQuery.mockImplementation(((cb: () => Promise<unknown>) => {
                queryCallbacks.push(cb);
                return undefined;
            }) as typeof useLiveQuery);

            render(<CardEditorModalWrapper />);

            // Should have 4 live queries
            expect(queryCallbacks.length).toBe(4);

            // Execute each callback to trigger the branches
            queryCallbacks.forEach(cb => {
                // Each callback should handle undefined/null gracefully
                expect(() => cb()).not.toThrow();
            });
        });

        it('should handle null imageId in live query', async () => {
            mockModalStore.mockImplementation((selector: (state: typeof mockStoreData) => unknown) => selector({
                ...mockStoreData,
                card: { ...mockStoreData.card, imageId: null as unknown as string } as unknown as CardOption,
                backCard: { ...mockStoreData.backCard, imageId: null as unknown as string } as unknown as CardOption,
            }));

            let imageQueryCallback: (() => Promise<unknown>) | undefined;
            let callCount = 0;

            mockLiveQuery.mockImplementation(((cb: () => Promise<unknown>) => {
                callCount++;
                if (callCount === 2) {
                    imageQueryCallback = cb;
                }
                return undefined;
            }) as typeof useLiveQuery);

            render(<CardEditorModalWrapper />);

            // Execute the image query callback - should return undefined for null imageId
            if (imageQueryCallback) {
                const result = await imageQueryCallback();
                expect(result).toBeUndefined();
            }
        });
    });
});
