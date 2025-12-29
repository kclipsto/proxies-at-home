import { useRef, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, Star, Check } from 'lucide-react';

// Shared styling constants for consistent dropdowns
export const dropdownButtonClass = "no-active-translate flex items-center justify-between px-2 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-left text-sm focus:ring-0 whitespace-nowrap";
export const dropdownPanelClass = "fixed z-100000 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg overflow-y-auto overscroll-contain";
export const dropdownLabelClass = "text-gray-600 dark:text-gray-400 whitespace-nowrap";

type FavoritesConfig = {
    /** Array of favorite option values */
    values: (string | number)[];
    /** Check if a value is currently selected */
    isSelected: (value: string | number) => boolean;
    /** Toggle selection of a value */
    onToggle: (value: string | number) => void;
};

type Props = {
    /** Optional label displayed before the dropdown button */
    label?: string;
    /** Text displayed when no items selected (e.g., "Any") - used in multi-select mode */
    buttonText: string;
    /** Number of selected items - if > 0, displays as "<check icon> N" instead of buttonText (multi-select mode only) */
    selectedCount?: number;
    /** Whether the dropdown is currently open */
    isOpen: boolean;
    /** Called when the button is clicked to toggle the dropdown */
    onToggle: () => void;
    /** Called when a click occurs outside the dropdown (to close it) */
    onClose: () => void;
    /** Dropdown content (checkboxes, buttons, etc.) */
    children: ReactNode;
    /** Optional max height for the dropdown panel */
    dropdownMaxHeight?: string;
    /** Optional additional className for the container */
    className?: string;
    /** Optional favorites configuration for star toggle button */
    favorites?: FavoritesConfig;
    /** Hide favorites star button in either mode */
    disableFavorites?: boolean;
    /** Enable single-select mode: shows selectedLabel, simpler favorites (one at a time) */
    singleSelectMode?: boolean;
    /** Label of currently selected item (used in singleSelectMode) */
    selectedLabel?: string;
};

/**
 * A reusable dropdown component with consistent styling.
 * Supports both multi-select (default) and single-select modes.
 * 
 * Multi-select mode: Shows check + count when items selected, renders children with checkboxes.
 * Single-select mode: Shows selectedLabel, renders children as simple buttons, no favorites star button.
 * 
 * Uses a portal to render dropdown outside of container for proper floating.
 */
export function SelectDropdown({
    label,
    buttonText,
    selectedCount,
    isOpen,
    onToggle,
    onClose,
    children,
    dropdownMaxHeight = '14rem',
    className = '',
    favorites,
    disableFavorites = false,
    singleSelectMode = false,
    selectedLabel,
}: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

    // Calculate if all favorites are selected (multi) or any favorite is selected (single)
    const anyFavoriteSelected = favorites && favorites.values.length > 0 &&
        favorites.values.some(v => favorites.isSelected(v));
    const allFavoritesSelected = favorites && favorites.values.length > 0 &&
        favorites.values.every(v => favorites.isSelected(v));

    // Calculate dropdown position
    useLayoutEffect(() => {
        if (isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setDropdownPos({
                top: rect.bottom + 4,
                left: rect.left,
            });
        }
    }, [isOpen]);

    // Click outside to close
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (event: MouseEvent | TouchEvent) => {
            const target = event.target as Node;
            if (
                containerRef.current && !containerRef.current.contains(target) &&
                dropdownRef.current && !dropdownRef.current.contains(target)
            ) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [isOpen, onClose]);

    // Handle favorites toggle
    const handleFavoritesToggle = () => {
        if (!favorites) return;

        if (singleSelectMode) {
            // Single-select: toggle the first favorite (only one at a time)
            // If any favorite is selected, deselect all favorites
            // Otherwise, select the first favorite
            if (anyFavoriteSelected) {
                favorites.values.forEach(v => {
                    if (favorites.isSelected(v)) {
                        favorites.onToggle(v);
                    }
                });
            } else if (favorites.values.length > 0) {
                favorites.onToggle(favorites.values[0]);
            }
        } else {
            // Multi-select: toggle all favorites
            if (allFavoritesSelected) {
                favorites.values.forEach(v => {
                    if (favorites.isSelected(v)) {
                        favorites.onToggle(v);
                    }
                });
            } else {
                favorites.values.forEach(v => {
                    if (!favorites.isSelected(v)) {
                        favorites.onToggle(v);
                    }
                });
            }
        }
    };

    // Button content differs between modes
    const renderButtonContent = () => {
        if (singleSelectMode) {
            // Single-select: show selected label or fallback to buttonText
            return <span>{selectedLabel || buttonText}</span>;
        }
        // Multi-select: show check + count or buttonText
        return (
            <span className="flex items-center gap-1">
                {selectedCount && selectedCount > 0 ? (
                    <><Check className="w-3.5 h-3.5 text-green-500" />{selectedCount}</>
                ) : (
                    buttonText
                )}
            </span>
        );
    };

    return (
        <div className={`flex items-center gap-1.5 ${className}`}>
            {/* Favorites star button - shown unless disabled */}
            {!disableFavorites && favorites && favorites.values.length > 0 && (
                <button
                    type="button"
                    onClick={handleFavoritesToggle}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-600"
                    title={singleSelectMode
                        ? (anyFavoriteSelected ? "Deselect favorite" : "Select favorite")
                        : (allFavoritesSelected ? "Deselect favorites" : "Select favorites")
                    }
                >
                    <Star className={`w-4 h-4 ${(singleSelectMode ? anyFavoriteSelected : allFavoritesSelected) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`} />
                </button>
            )}
            <div ref={containerRef} className="relative h-10">
                <button
                    ref={buttonRef}
                    type="button"
                    onClick={onToggle}
                    className="no-active-translate flex items-center h-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-0 whitespace-nowrap overflow-hidden"
                >
                    {/* Split button: Label on left with separator */}
                    {label && (
                        <>
                            <span className="h-full flex items-center px-2 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-600">
                                {label}
                            </span>
                            <span className="w-px h-full bg-gray-300 dark:bg-gray-500" />
                        </>
                    )}
                    {/* Value section */}
                    <span className="h-full flex items-center gap-1 px-2 text-gray-900 dark:text-white">
                        {renderButtonContent()}
                        {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
                    </span>
                </button>
                {isOpen && createPortal(
                    <div
                        ref={dropdownRef}
                        className="fixed z-100000 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg overflow-y-auto overscroll-contain flex flex-col"
                        style={{ top: dropdownPos.top, left: dropdownPos.left, maxHeight: dropdownMaxHeight }}
                    >
                        {children}
                    </div>,
                    document.body
                )}
            </div>
        </div>
    );
}


