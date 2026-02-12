import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock stores and child components
const mockToggleUploadPanel = vi.fn();

vi.mock('@/store/settings', () => ({
    useSettingsStore: vi.fn((selector) => {
        const state = { toggleUploadPanel: mockToggleUploadPanel };
        return selector(state);
    }),
}));

vi.mock('@/assets/fullLogo.png', () => ({
    default: '/mock-full-logo.png',
}));

vi.mock('./PullToRefresh', () => ({
    PullToRefresh: ({ children, className }: { children: React.ReactNode; className?: string }) => (
        <div data-testid="pull-to-refresh" className={className}>{children}</div>
    ),
}));

vi.mock('./common', () => ({
    AutoTooltip: ({ children, content }: { children: React.ReactNode; content: string }) => (
        <div data-testid="auto-tooltip" data-content={content}>{children}</div>
    ),
}));

vi.mock('./Upload', () => ({
    FileUploader: ({ mobile, onUploadComplete }: { mobile?: boolean; onUploadComplete?: () => void }) => (
        <div data-testid="file-uploader" data-mobile={mobile} data-has-callback={!!onUploadComplete}>FileUploader</div>
    ),
    MpcImportSection: ({ mobile, onUploadComplete }: { mobile?: boolean; onUploadComplete?: () => void }) => (
        <div data-testid="mpc-import-section" data-mobile={mobile} data-has-callback={!!onUploadComplete}>MpcImportSection</div>
    ),
    DecklistUploader: ({ mobile, cardCount, onUploadComplete }: { mobile?: boolean; cardCount: number; onUploadComplete?: () => void }) => (
        <div data-testid="decklist-uploader" data-mobile={mobile} data-card-count={cardCount} data-has-callback={!!onUploadComplete}>DecklistUploader</div>
    ),
    DeckBuilderImporter: ({ mobile, onUploadComplete }: { mobile?: boolean; onUploadComplete?: () => void }) => (
        <div data-testid="deck-builder-importer" data-mobile={mobile} data-has-callback={!!onUploadComplete}>DeckBuilderImporter</div>
    ),
}));

vi.mock('flowbite-react', () => ({
    HR: ({ className }: { className?: string }) => <hr data-testid="hr" className={className} />,
}));

import { UploadSection } from './UploadSection';

describe('UploadSection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('collapsed view', () => {
        it('should render collapsed view when isCollapsed is true', () => {
            render(<UploadSection isCollapsed={true} cardCount={10} />);

            // Should show logo button
            expect(screen.getByAltText('Proxxied Logo')).toBeDefined();
            // Should not show uploaders
            expect(screen.queryByTestId('file-uploader')).toBeNull();
        });

        it('should toggle upload panel when clicking logo button', () => {
            render(<UploadSection isCollapsed={true} cardCount={10} onToggle={mockToggleUploadPanel} />);

            const logoButton = screen.getByAltText('Proxxied Logo').closest('button');
            fireEvent.click(logoButton!);

            expect(mockToggleUploadPanel).toHaveBeenCalled();
        });

        it('should toggle upload panel on double-click of container', () => {
            const { container } = render(<UploadSection isCollapsed={true} cardCount={10} onToggle={mockToggleUploadPanel} />);

            const collapsedContainer = container.firstChild as HTMLElement;
            fireEvent.doubleClick(collapsedContainer);

            expect(mockToggleUploadPanel).toHaveBeenCalled();
        });

        it('should wrap logo in AutoTooltip', () => {
            render(<UploadSection isCollapsed={true} cardCount={10} />);

            const tooltip = screen.getByTestId('auto-tooltip');
            expect(tooltip).toBeDefined();
            expect(tooltip.getAttribute('data-content')).toBe('Proxxied');
        });

        it('should apply mobile scrollbar class when mobile', () => {
            const { container } = render(<UploadSection isCollapsed={true} cardCount={10} mobile={true} />);

            const collapsedContainer = container.firstChild as HTMLElement;
            expect(collapsedContainer.className).toContain('mobile-scrollbar-hide');
        });

        it('should not apply mobile scrollbar class when not mobile', () => {
            const { container } = render(<UploadSection isCollapsed={true} cardCount={10} mobile={false} />);

            const collapsedContainer = container.firstChild as HTMLElement;
            expect(collapsedContainer.className).not.toContain('mobile-scrollbar-hide');
        });
    });

    describe('expanded view', () => {
        it('should render expanded view when isCollapsed is false', () => {
            render(<UploadSection isCollapsed={false} cardCount={10} />);

            expect(screen.getByTestId('file-uploader')).toBeDefined();
            expect(screen.getByTestId('mpc-import-section')).toBeDefined();
            expect(screen.getByTestId('decklist-uploader')).toBeDefined();
            expect(screen.getAllByTestId('deck-builder-importer')).toHaveLength(2); // One portrait, one landscape
        });

        it('should render expanded view by default', () => {
            render(<UploadSection cardCount={10} />);

            expect(screen.getByTestId('file-uploader')).toBeDefined();
        });

        it('should show full logo on desktop', () => {
            render(<UploadSection isCollapsed={false} cardCount={10} mobile={false} />);

            // Full logo should be visible (in the outer div, not in PullToRefresh)
            const fullLogos = screen.getAllByAltText('Proxxied Logo');
            expect(fullLogos.length).toBeGreaterThanOrEqual(1);
        });

        it('should show logo inside PullToRefresh on mobile', () => {
            render(<UploadSection isCollapsed={false} cardCount={10} mobile={true} />);

            // Should have pull to refresh
            expect(screen.getByTestId('pull-to-refresh')).toBeDefined();
            // Logo should be present (portrait and landscape versions)
            expect(screen.getAllByAltText('Proxxied Logo')).toHaveLength(2);
        });

        it('should pass mobile prop to child uploaders', () => {
            render(<UploadSection isCollapsed={false} cardCount={10} mobile={true} />);

            expect(screen.getByTestId('file-uploader').getAttribute('data-mobile')).toBe('true');
            expect(screen.getByTestId('mpc-import-section').getAttribute('data-mobile')).toBe('true');
            expect(screen.getByTestId('decklist-uploader').getAttribute('data-mobile')).toBe('true');
        });

        it('should pass cardCount to DecklistUploader', () => {
            render(<UploadSection isCollapsed={false} cardCount={42} />);

            expect(screen.getByTestId('decklist-uploader').getAttribute('data-card-count')).toBe('42');
        });

        it('should pass onUploadComplete callback to uploaders', () => {
            const onUploadComplete = vi.fn();
            render(<UploadSection isCollapsed={false} cardCount={10} onUploadComplete={onUploadComplete} />);

            expect(screen.getByTestId('file-uploader').getAttribute('data-has-callback')).toBe('true');
            expect(screen.getByTestId('mpc-import-section').getAttribute('data-has-callback')).toBe('true');
            expect(screen.getByTestId('decklist-uploader').getAttribute('data-has-callback')).toBe('true');
        });

        it('should render tips section', () => {
            render(<UploadSection isCollapsed={false} cardCount={10} />);

            expect(screen.getByText('Tips:')).toBeDefined();
        });

        it('should render MPC Autofill link', () => {
            render(<UploadSection isCollapsed={false} cardCount={10} />);

            const mpcLink = screen.getByRole('link', { name: /MPC Autofill/i });
            expect(mpcLink.getAttribute('href')).toBe('https://mpcfill.com');
            expect(mpcLink.getAttribute('target')).toBe('_blank');
        });

        it('should render Archidekt link', () => {
            render(<UploadSection isCollapsed={false} cardCount={10} />);

            const archidektLink = screen.getByRole('link', { name: /Archidekt/i });
            expect(archidektLink.getAttribute('href')).toBe('https://archidekt.com');
            expect(archidektLink.getAttribute('target')).toBe('_blank');
        });

        it('should render Moxfield link', () => {
            render(<UploadSection isCollapsed={false} cardCount={10} />);

            const moxfieldLink = screen.getByRole('link', { name: /Moxfield/i });
            expect(moxfieldLink.getAttribute('href')).toBe('https://moxfield.com');
            expect(moxfieldLink.getAttribute('target')).toBe('_blank');
        });

        it('should render horizontal rules', () => {
            render(<UploadSection isCollapsed={false} cardCount={10} />);

            const hrs = screen.getAllByTestId('hr');
            expect(hrs.length).toBe(3);
        });
    });

    describe('tips content variations', () => {
        it('should show "click" for desktop card interaction tip', () => {
            render(<UploadSection isCollapsed={false} cardCount={10} mobile={false} />);

            expect(screen.getByText(/To change a card art - click it/)).toBeDefined();
        });

        it('should show "tap" for mobile card interaction tip', () => {
            render(<UploadSection isCollapsed={false} cardCount={10} mobile={true} />);

            expect(screen.getByText(/To change a card art - tap it/)).toBeDefined();
        });

        it('should show desktop drag instructions', () => {
            render(<UploadSection isCollapsed={false} cardCount={10} mobile={false} />);

            expect(screen.getByText(/just drag it/)).toBeDefined();
        });

        it('should show mobile drag instructions', () => {
            render(<UploadSection isCollapsed={false} cardCount={10} mobile={true} />);

            expect(screen.getByText(/long press and drag/)).toBeDefined();
        });

        it('should show desktop duplicate/delete instructions', () => {
            render(<UploadSection isCollapsed={false} cardCount={10} mobile={false} />);

            expect(screen.getByText(/right click/)).toBeDefined();
        });

        it('should show mobile duplicate/delete instructions', () => {
            render(<UploadSection isCollapsed={false} cardCount={10} mobile={true} />);

            expect(screen.getByText(/double tap/)).toBeDefined();
        });

        it('should show custom upload tip', () => {
            render(<UploadSection isCollapsed={false} cardCount={10} />);

            expect(screen.getByText(/mtgcardsmith/)).toBeDefined();
        });

        it('should show deck category import tip', () => {
            render(<UploadSection isCollapsed={false} cardCount={10} />);

            expect(screen.getByText(/filter by deck categories/)).toBeDefined();
        });
    });

    describe('PullToRefresh wrapper', () => {
        it('should wrap content in PullToRefresh', () => {
            render(<UploadSection isCollapsed={false} cardCount={10} />);

            expect(screen.getByTestId('pull-to-refresh')).toBeDefined();
        });

        it('should apply mobile scrollbar hiding class on mobile', () => {
            render(<UploadSection isCollapsed={false} cardCount={10} mobile={true} />);

            const pullToRefresh = screen.getByTestId('pull-to-refresh');
            expect(pullToRefresh.className).toContain('[&::-webkit-scrollbar]:hidden');
        });
    });
});
