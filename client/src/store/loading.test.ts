import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useLoadingStore } from './loading';

describe('useLoadingStore', () => {
    beforeEach(() => {
        useLoadingStore.setState({
            loadingTask: null,
            loadingMessage: null,
            progress: 0,
            onCancel: null,
        });
    });

    it('should have default state', () => {
        const state = useLoadingStore.getState();
        expect(state.loadingTask).toBeNull();
        expect(state.loadingMessage).toBeNull();
        expect(state.progress).toBe(0);
        expect(state.onCancel).toBeNull();
    });

    it('should set loading task', () => {
        useLoadingStore.getState().setLoadingTask("Fetching cards");
        const state = useLoadingStore.getState();
        expect(state.loadingTask).toBe("Fetching cards");
        expect(state.progress).toBe(-1);
        expect(state.onCancel).toBeNull();
        expect(state.loadingMessage).toBeNull();
    });

    it('should set loading message', () => {
        useLoadingStore.getState().setLoadingMessage("Please wait...");
        const state = useLoadingStore.getState();
        expect(state.loadingMessage).toBe("Please wait...");
    });

    it('should set progress', () => {
        useLoadingStore.getState().setProgress(50);
        const state = useLoadingStore.getState();
        expect(state.progress).toBe(50);
    });

    it('should set onCancel', () => {
        const onCancel = vi.fn();
        useLoadingStore.getState().setOnCancel(onCancel);
        const state = useLoadingStore.getState();
        expect(state.onCancel).toBe(onCancel);
    });
});
