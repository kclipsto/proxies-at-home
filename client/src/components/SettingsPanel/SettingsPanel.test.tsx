import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Settings } from 'lucide-react';

// Mock @dnd-kit/sortable
vi.mock('@dnd-kit/sortable', () => ({
    useSortable: () => ({
        attributes: {},
        listeners: {},
        setNodeRef: vi.fn(),
        transform: null,
        transition: null,
        isDragging: false,
    }),
}));

vi.mock('@dnd-kit/utilities', () => ({
    CSS: {
        Translate: {
            toString: () => '',
        },
    },
}));

import { SettingsPanel } from './SettingsPanel';

describe('SettingsPanel', () => {
    it('should render title', () => {
        const onToggle = vi.fn();
        render(
            <SettingsPanel
                id="test"
                title="Test Panel"
                isOpen={false}
                onToggle={onToggle}
                icon={Settings}
            >
                <div>Content</div>
            </SettingsPanel>
        );

        expect(screen.getByText('Test Panel')).toBeDefined();
    });

    it('should show children when open', () => {
        const onToggle = vi.fn();
        render(
            <SettingsPanel
                id="test"
                title="Test Panel"
                isOpen={true}
                onToggle={onToggle}
                icon={Settings}
            >
                <div>Content Here</div>
            </SettingsPanel>
        );

        expect(screen.getByText('Content Here')).toBeDefined();
    });

    it('should hide children when closed', () => {
        const onToggle = vi.fn();
        render(
            <SettingsPanel
                id="test"
                title="Test Panel"
                isOpen={false}
                onToggle={onToggle}
                icon={Settings}
            >
                <div>Content Here</div>
            </SettingsPanel>
        );

        expect(screen.queryByText('Content Here')).toBeNull();
    });

    it('should call onToggle when header is clicked', () => {
        const onToggle = vi.fn();
        render(
            <SettingsPanel
                id="test"
                title="Test Panel"
                isOpen={false}
                onToggle={onToggle}
                icon={Settings}
            >
                <div>Content</div>
            </SettingsPanel>
        );

        fireEvent.click(screen.getByText('Test Panel'));
        expect(onToggle).toHaveBeenCalled();
    });

    it('should show badge when provided', () => {
        const onToggle = vi.fn();
        render(
            <SettingsPanel
                id="test"
                title="Test Panel"
                isOpen={false}
                onToggle={onToggle}
                icon={Settings}
                badge={5}
            >
                <div>Content</div>
            </SettingsPanel>
        );

        expect(screen.getByText('5')).toBeDefined();
    });
});
