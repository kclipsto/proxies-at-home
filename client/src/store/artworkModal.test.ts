import { describe, it, expect, beforeEach } from 'vitest';
import { useArtworkModalStore } from './artworkModal';
import type { CardOption } from '../../../shared/types';

describe('useArtworkModalStore', () => {
    beforeEach(() => {
        useArtworkModalStore.setState({
            open: false,
            card: null,
            index: null,
            initialTab: 'artwork',
            initialFace: 'front',
        });
    });

    it('should have default state', () => {
        const state = useArtworkModalStore.getState();
        expect(state.open).toBe(false);
        expect(state.card).toBeNull();
        expect(state.index).toBeNull();
        expect(state.initialTab).toBe('artwork');
        expect(state.initialFace).toBe('front');
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

    it('should open modal with initialFace set to back when specified', () => {
        const card: CardOption = {
            uuid: '1',
            name: 'Test Card',
            imageId: 'test.jpg',
            order: 0,
            isUserUpload: false
        };

        useArtworkModalStore.getState().openModal({ card, index: 0, initialFace: 'back' });

        const state = useArtworkModalStore.getState();
        expect(state.open).toBe(true);
        expect(state.initialFace).toBe('back');
    });

    it('should default initialFace to front when not specified', () => {
        const card: CardOption = {
            uuid: '1',
            name: 'Test Card',
            imageId: 'test.jpg',
            order: 0,
            isUserUpload: false
        };

        useArtworkModalStore.getState().openModal({ card, index: 0 });

        const state = useArtworkModalStore.getState();
        expect(state.initialFace).toBe('front');
    });

    it('should open modal with initialTab set to settings when specified', () => {
        const card: CardOption = {
            uuid: '1',
            name: 'Test Card',
            imageId: 'test.jpg',
            order: 0,
            isUserUpload: false
        };

        useArtworkModalStore.getState().openModal({ card, index: 0, initialTab: 'settings' });

        const state = useArtworkModalStore.getState();
        expect(state.initialTab).toBe('settings');
    });

    it('should reset initialFace and initialTab when modal is closed', () => {
        const card: CardOption = {
            uuid: '1',
            name: 'Test Card',
            imageId: 'test.jpg',
            order: 0,
            isUserUpload: false
        };

        // Open with back face and settings tab
        useArtworkModalStore.getState().openModal({ card, index: 0, initialFace: 'back', initialTab: 'settings' });
        expect(useArtworkModalStore.getState().initialFace).toBe('back');
        expect(useArtworkModalStore.getState().initialTab).toBe('settings');

        // Close modal
        useArtworkModalStore.getState().closeModal();

        // Should reset to defaults
        const state = useArtworkModalStore.getState();
        expect(state.initialFace).toBe('front');
        expect(state.initialTab).toBe('artwork');
    });
});

