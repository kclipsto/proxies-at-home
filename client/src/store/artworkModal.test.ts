import { describe, it, expect, beforeEach } from 'vitest';
import { useArtworkModalStore } from './artworkModal';
import type { CardOption } from '../../../shared/types';

describe('useArtworkModalStore', () => {
    beforeEach(() => {
        useArtworkModalStore.setState({
            open: false,
            card: null,
            index: null,
        });
    });

    it('should have default state', () => {
        const state = useArtworkModalStore.getState();
        expect(state.open).toBe(false);
        expect(state.card).toBeNull();
        expect(state.index).toBeNull();
    });

    it('should open modal', () => {
        const card: CardOption = {
            uuid: '1',
            name: 'Test Card',
            imageId: 'test.jpg',
            order: 0,
            isUserUpload: false
        };

        useArtworkModalStore.getState().openModal({ card, index: 0 });

        const state = useArtworkModalStore.getState();
        expect(state.open).toBe(true);
        expect(state.card).toEqual(card);
        expect(state.index).toBe(0);
    });

    it('should close modal', () => {
        const card: CardOption = {
            uuid: '1',
            name: 'Test Card',
            imageId: 'test.jpg',
            order: 0,
            isUserUpload: false
        };

        useArtworkModalStore.setState({ open: true, card, index: 0 });
        useArtworkModalStore.getState().closeModal();

        const state = useArtworkModalStore.getState();
        expect(state.open).toBe(false);
        expect(state.card).toBeNull();
        expect(state.index).toBeNull();
    });

    it('should update card', () => {
        const card: CardOption = {
            uuid: '1',
            name: 'Test Card',
            imageId: 'test.jpg',
            order: 0,
            isUserUpload: false
        };

        useArtworkModalStore.setState({ open: true, card, index: 0 });

        const updatedCard: CardOption = { ...card, name: 'Updated Card' };
        useArtworkModalStore.getState().updateCard(updatedCard);

        const state = useArtworkModalStore.getState();
        expect(state.card).toEqual(updatedCard);
    });

    it('should not update card if no card is selected', () => {
        useArtworkModalStore.setState({ open: true, card: null, index: 0 });

        const updatedCard: CardOption = {
            uuid: '1',
            name: 'Updated Card',
            imageId: 'test.jpg',
            order: 0,
            isUserUpload: false
        };

        useArtworkModalStore.getState().updateCard(updatedCard);

        const state = useArtworkModalStore.getState();
        expect(state.card).toBeNull();
    });
});
