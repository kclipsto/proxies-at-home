import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ApplicationSection } from './ApplicationSection';

// Mock Mock hoisted values
const mockState = vi.hoisted(() => ({
    showProcessingToasts: true,
    decklistSortAlpha: false,
    preferredArtSource: 'scryfall' as 'scryfall' | 'mpc',
}));

const mockSetters = vi.hoisted(() => ({
    resetSettings: vi.fn(),
    setShowProcessingToasts: vi.fn(),
    setDecklistSortAlpha: vi.fn(),
    setPreferredArtSource: vi.fn(),
}));

vi.mock('@/store/settings', () => ({
    useSettingsStore: vi.fn((selector) => {
        const state = { ...mockState, ...mockSetters };
        return selector(state);
    }),
}));

vi.mock('flowbite-react', () => ({
    Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => <label htmlFor={htmlFor}>{children}</label>,
    Button: ({ children, onClick, color, fullSized }: { children: React.ReactNode; onClick?: () => void; color?: string; fullSized?: boolean }) => (
        <button onClick={onClick} data-color={color} data-fullsized={fullSized}>{children}</button>
    ),
    Checkbox: ({ id, checked, onChange }: { id: string; checked: boolean; onChange: (e: { target: { checked: boolean } }) => void }) => (
        <input type="checkbox" id={id} data-testid={id} checked={checked} onChange={(e) => onChange({ target: { checked: e.target.checked } })} />
    ),
    Radio: ({ name, value, checked, onChange }: { name: string; value: string; checked: boolean; onChange: () => void }) => (
        <input type="radio" data-testid={`radio-${name}-${value}`} name={name} value={value} checked={checked} onChange={onChange} />
    ),
    Select: ({ children, value, onChange }: { children: React.ReactNode; value: string; onChange: (e: { target: { value: string } }) => void }) => (
        <select value={value} onChange={(e) => onChange({ target: { value: e.target.value } })}>{children}</select>
    ),
}));

vi.mock('@/components/common', () => ({
    ArtSourceToggle: ({
        value,
        onChange,
    }: {
        value: string;
        onChange: (val: 'scryfall' | 'mpc') => void;
    }) => (
        <div data-testid="art-source-toggle" data-value={value}>
            <button data-testid="toggle-btn-mpc" onClick={() => onChange('mpc')}>MPC Autofill</button>
            <button data-testid="toggle-btn-scryfall" onClick={() => onChange('scryfall')}>Scryfall</button>
        </div>
    ),
    AutoTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    UpdateChannelSelector: () => <div data-testid="update-channel-selector">UpdateChannelSelector</div>,
}));

vi.mock('../../LayoutSettings/ExportActions', () => ({
    ExportActions: () => <div data-testid="export-actions">ExportActions</div>,
}));

vi.mock('@/db', () => ({
    db: {
        transaction: vi.fn((_mode, ...tablesAndFn) => {
            // The last argument is the callback
            const fn = tablesAndFn[tablesAndFn.length - 1];
            return fn();
        }),
        cards: { clear: vi.fn() },
        images: { clear: vi.fn() },
        user_images: { clear: vi.fn() },
        projects: { clear: vi.fn() },
        settings: { clear: vi.fn() },
        cardMetadataCache: { clear: vi.fn() },
        mpcSearchCache: { clear: vi.fn() },
        imageCache: { clear: vi.fn() },
        scryfallSetsCache: { clear: vi.fn() },
    },
}));

vi.mock('@/helpers/cancellationService', () => ({
    cancelAllProcessing: vi.fn(),
}));

import { cancelAllProcessing } from '@/helpers/cancellationService';
import { db } from '@/db';

describe('ApplicationSection', () => {
    // Save original globals
    const originalLocation = window.location;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState.showProcessingToasts = true;
        mockState.decklistSortAlpha = false;
        mockState.preferredArtSource = 'scryfall';

        // Mock window.location with reload
        delete (window as unknown as { location?: Location }).location;
        (window as unknown as { location: { href: string; origin: string; reload: ReturnType<typeof vi.fn> } }).location = {
            href: '',
            origin: 'http://localhost',
            reload: vi.fn(),
        };
    });

    afterEach(() => {
        Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
        // Restore other globals if we modify them on the prototype/global object
        // Note: navigator.serviceWorker is read-only usually, so check implementation below
    });



    describe('reset app data', () => {
        it('should show confirmation modal when Reset App Data is clicked', () => {
            render(<ApplicationSection />);
            fireEvent.click(screen.getByText('Reset App Data'));
            expect(screen.getByText('Confirm Reset App Data')).toBeDefined();
        });

        it('should close modal when No, cancel is clicked', () => {
            render(<ApplicationSection />);
            fireEvent.click(screen.getByText('Reset App Data'));
            fireEvent.click(screen.getByText('No, cancel'));
            expect(screen.queryByText('Confirm Reset App Data')).toBeNull();
        });

        it('should perform reset operations when confirmed', async () => {
            // Mock Service Worker
            const mockUnregister = vi.fn();
            Object.defineProperty(navigator, 'serviceWorker', {
                value: {
                    getRegistrations: vi.fn().mockResolvedValue([{ unregister: mockUnregister }]),
                },
                writable: true,
                configurable: true
            });

            // Mock Caches
            const mockCacheDelete = vi.fn();
            Object.defineProperty(window, 'caches', {
                value: {
                    keys: vi.fn().mockResolvedValue(['cache-v1']),
                    delete: mockCacheDelete,
                },
                writable: true,
                configurable: true
            });

            // Mock localStorage
            const mockRemoveItem = vi.spyOn(Storage.prototype, 'removeItem');

            render(<ApplicationSection />);

            // Open modal
            fireEvent.click(screen.getByText('Reset App Data'));

            // Click Confirm
            fireEvent.click(screen.getByText("Yes, I'm sure"));

            await waitFor(() => {
                // 1. Cancel processing
                expect(cancelAllProcessing).toHaveBeenCalled();

                // 2. Unregister SW
                expect(navigator.serviceWorker.getRegistrations).toHaveBeenCalled();
                expect(mockUnregister).toHaveBeenCalled();

                // 3. Clear DB
                expect(db.cards.clear).toHaveBeenCalled();
                expect(db.images.clear).toHaveBeenCalled();
                expect(db.settings.clear).toHaveBeenCalled();
                expect(db.cardMetadataCache.clear).toHaveBeenCalled();
                expect(db.cardMetadataCache.clear).toHaveBeenCalled();
                expect(db.mpcSearchCache.clear).toHaveBeenCalled();
                expect(db.scryfallSetsCache.clear).toHaveBeenCalled();

                // 4. LocalStorage
                expect(mockRemoveItem).toHaveBeenCalledWith('cardback-delete-confirm-disabled');

                // 5. Reset Settings Store
                expect(mockSetters.resetSettings).toHaveBeenCalled();

                // 6. Clear Caches
                expect(window.caches.keys).toHaveBeenCalled();
                expect(mockCacheDelete).toHaveBeenCalledWith('cache-v1');

                // 7. Reload page
                expect(window.location.reload).toHaveBeenCalled();
            });
        });

        it('should handle errors gracefully during reset', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
            vi.mocked(cancelAllProcessing).mockImplementation(() => { throw new Error('Test Error'); });

            render(<ApplicationSection />);
            fireEvent.click(screen.getByText('Reset App Data'));
            fireEvent.click(screen.getByText("Yes, I'm sure"));

            await waitFor(() => {
                expect(window.location.reload).toHaveBeenCalled(); // Finally block should still run
            });

            consoleSpy.mockRestore();
        });
    });


    describe('preferred art source', () => {
        it('should call setPreferredArtSource(mpc) when MPC is selected', () => {
            mockState.preferredArtSource = 'scryfall';
            render(<ApplicationSection />);
            fireEvent.click(screen.getByTestId('toggle-btn-mpc'));
            expect(mockSetters.setPreferredArtSource).toHaveBeenCalledWith('mpc');
        });
        it('should call setPreferredArtSource(scryfall) when Scryfall is selected', () => {
            mockState.preferredArtSource = 'mpc';
            render(<ApplicationSection />);
            fireEvent.click(screen.getByTestId('toggle-btn-scryfall'));
            expect(mockSetters.setPreferredArtSource).toHaveBeenCalledWith('scryfall');
        });
    });

    describe('processing toasts', () => {
        it('should call setShowProcessingToasts when checkbox changes', () => {
            render(<ApplicationSection />);
            const checkbox = screen.getByTestId('show-processing-toasts');
            fireEvent.click(checkbox);
            expect(mockSetters.setShowProcessingToasts).toHaveBeenCalled();
        });
    });

    describe('reset settings', () => {
        it('should call resetSettings when Restore Factory Settings button is clicked', () => {
            render(<ApplicationSection />);
            fireEvent.click(screen.getByText('Restore Factory Settings'));
            expect(mockSetters.resetSettings).toHaveBeenCalled();
        });
    });
});
