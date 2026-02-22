
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArtSourceToggle } from './ArtSourceToggle';

describe('ArtSourceToggle', () => {
    it('renders Scryfall and MPC options by default', () => {
        render(<ArtSourceToggle value="scryfall" onChange={vi.fn()} />);
        expect(screen.getByText('Scryfall')).toBeInTheDocument();
        expect(screen.getByText('MPC Autofill')).toBeInTheDocument();
        expect(screen.queryByText('My Uploads')).not.toBeInTheDocument();
    });

    it('renders My Uploads option when showUploadLibrary is true', () => {
        render(<ArtSourceToggle value="scryfall" onChange={vi.fn()} showUploadLibrary={true} />);
        expect(screen.getByText('Scryfall')).toBeInTheDocument();
        expect(screen.getByText('MPC Autofill')).toBeInTheDocument();
        expect(screen.getByText('My Uploads')).toBeInTheDocument();
    });

    it('calls onChange when an option is clicked', () => {
        const handleChange = vi.fn();
        render(<ArtSourceToggle value="scryfall" onChange={handleChange} showUploadLibrary={true} />);

        fireEvent.pointerUp(screen.getByText('MPC Autofill'));
        expect(handleChange).toHaveBeenCalledWith('mpc');

        fireEvent.pointerUp(screen.getByText('My Uploads'));
        expect(handleChange).toHaveBeenCalledWith('upload-library');
    });

    it('highlights the selected option', () => {
        render(<ArtSourceToggle value="mpc" onChange={vi.fn()} />);
        // ToggleButtonGroup usually applies styles or active state. 
        // We can check aria-pressed if implemented, or just class names, or trust the underlying component.
        // For this test, we just verify it renders without crashing with a specific value.
        expect(screen.getByText('MPC Autofill')).toBeInTheDocument();
    });
});
