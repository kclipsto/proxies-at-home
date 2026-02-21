/**
 * ColorPicker - Reusable color picker with hex input
 * Uses react-colorful for themeable popover
 */

import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { HexColorPicker } from 'react-colorful';
import { Pipette, ChevronUp, ChevronDown } from 'lucide-react';
import { useFloating, offset, flip, shift } from '@floating-ui/react';

// Compact spin input for color values
interface SpinInputProps {
    value: number;
    min: number;
    max: number;
    onChange: (value: number) => void;
    label: string;
}

function SpinInput({ value, min, max, onChange, label }: SpinInputProps) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value) || 0;
        onChange(Math.max(min, Math.min(max, val)));
    };
    const increment = () => onChange(Math.min(max, value + 1));
    const decrement = () => onChange(Math.max(min, value - 1));
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            increment();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            decrement();
        }
    };

    return (
        <div className="flex flex-col items-center flex-1">
            <div className="relative group w-12">
                <input
                    type="text"
                    value={value}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    className="w-12 h-7 px-1 pr-5 font-mono text-xs text-center text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-600 rounded border-0 outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield]"
                />
                <div className="absolute right-0.5 top-0.5 bottom-0.5 w-4 flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        type="button"
                        tabIndex={-1}
                        onClick={increment}
                        className="flex-1 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-500 dark:text-gray-400 rounded-t flex items-center justify-center"
                    >
                        <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                        type="button"
                        tabIndex={-1}
                        onClick={decrement}
                        className="flex-1 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-500 dark:text-gray-400 rounded-b flex items-center justify-center"
                    >
                        <ChevronDown className="w-3 h-3" />
                    </button>
                </div>
            </div>
            <span className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{label}</span>
        </div>
    );
}

interface ColorPickerProps {
    /** Label displayed above the picker */
    label: string;
    /** Current color value (hex) */
    value: string;
    /** Called on every color change (live preview) */
    onChange: (value: string) => void;
    /** Optional: Called when user finishes picking (closes popover or blurs text input) - useful for undo tracking */
    onChangeEnd?: (value: string, previousValue: string) => void;
}

// Check if EyeDropper API is available
const supportsEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window;

// Hex to RGB conversion
function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
        }
        : { r: 0, g: 0, b: 0 };
}

// RGB to Hex conversion
function rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(x => {
        const hex = Math.max(0, Math.min(255, x)).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

// RGB to HSL conversion
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

// HSL to RGB conversion
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;
    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

type ColorMode = 'rgb' | 'hsl';

export const ColorPicker = memo(function ColorPicker({ label, value, onChange, onChangeEnd }: ColorPickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [colorMode, setColorMode] = useState<ColorMode>('rgb');
    const valueOnOpenRef = useRef<string>(value);

    // Floating UI for positioning with flip/shift (no autoUpdate - close on scroll instead)
    const { refs, floatingStyles } = useFloating({
        open: isOpen,
        placement: 'bottom-start',
        middleware: [offset(4), flip(), shift()],
    });

    // Store value when popover opens for onChangeEnd callback
    const handleOpen = useCallback(() => {
        valueOnOpenRef.current = value;
        setIsOpen(true);
    }, [value]);

    // Handle popover close - call onChangeEnd if value changed
    const handleClose = useCallback(() => {
        if (isOpen && onChangeEnd && valueOnOpenRef.current !== value && value) {
            onChangeEnd(value, valueOnOpenRef.current);
        }
        setIsOpen(false);
    }, [isOpen, onChangeEnd, value]);

    // Close popover when clicking outside or scrolling
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            const floating = refs.floating.current;
            const reference = refs.reference.current as HTMLElement | null;
            if (
                floating &&
                !floating.contains(e.target as Node) &&
                reference &&
                !reference.contains(e.target as Node)
            ) {
                handleClose();
            }
        };

        const handleScroll = () => handleClose();

        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('scroll', handleScroll, true);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, [isOpen, handleClose, refs]);

    // Handle text input change with onChangeEnd on blur
    const handleTextChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(e.target.value);
    }, [onChange]);

    const handleTextBlur = useCallback(() => {
        if (onChangeEnd && valueOnOpenRef.current !== value) {
            onChangeEnd(value, valueOnOpenRef.current);
            valueOnOpenRef.current = value;
        }
    }, [onChangeEnd, value]);

    const handleTextFocus = useCallback(() => {
        valueOnOpenRef.current = value;
    }, [value]);

    // Eyedropper handler
    const handleEyeDropper = useCallback(async () => {
        if (!supportsEyeDropper) return;
        try {
            // @ts-expect-error - EyeDropper is not in TypeScript lib yet
            const eyeDropper = new window.EyeDropper();
            const result = await eyeDropper.open();
            onChange(result.sRGBHex);
            if (onChangeEnd) {
                onChangeEnd(result.sRGBHex, valueOnOpenRef.current);
                valueOnOpenRef.current = result.sRGBHex;
            }
        } catch {
            // User canceled or API not supported
        }
    }, [onChange, onChangeEnd]);

    // RGB handlers
    const rgb = hexToRgb(value);
    const handleRgbChange = useCallback((channel: 'r' | 'g' | 'b', val: number) => {
        const current = hexToRgb(value);
        current[channel] = val;
        onChange(rgbToHex(current.r, current.g, current.b));
    }, [value, onChange]);

    // HSL handlers
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const handleHslChange = useCallback((channel: 'h' | 's' | 'l', val: number) => {
        const current = rgbToHsl(hexToRgb(value).r, hexToRgb(value).g, hexToRgb(value).b);
        current[channel] = val;
        const newRgb = hslToRgb(current.h, current.s, current.l);
        onChange(rgbToHex(newRgb.r, newRgb.g, newRgb.b));
    }, [value, onChange]);
    return (
        <div className="mb-2">
            <label className="block text-xs text-gray-700 dark:text-gray-200 font-medium mb-1 select-none">{label}</label>
            <div className="flex items-center gap-2">
                {/* Color swatch button */}
                <button
                    ref={refs.setReference}
                    type="button"
                    onClick={() => isOpen ? handleClose() : handleOpen()}
                    className="flex-1 h-8 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                    style={{ backgroundColor: value }}
                    title="Click to pick color"
                />
                {/* Hex input */}
                <input
                    type="text"
                    value={value}
                    onChange={handleTextChange}
                    onFocus={handleTextFocus}
                    onBlur={handleTextBlur}
                    className="w-20 h-8 px-2 text-xs bg-transparent border border-gray-300 dark:border-gray-600 rounded-md text-gray-800 dark:text-gray-200 text-center"
                    placeholder="#000000"
                />
            </div>
            {/* Popover - rendered via portal with Floating UI for smooth positioning */}
            {isOpen && createPortal(
                <div
                    ref={refs.setFloating}
                    className="p-3 rounded-lg shadow-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600"
                    style={{ ...floatingStyles, zIndex: 9999 }}
                >
                    <HexColorPicker color={value} onChange={onChange} />

                    {/* Row 1: Eyedropper | Color+Hex (centered) | Mode toggle */}
                    <div className="flex items-center mt-3 px-2">
                        {/* Left: Eyedropper */}
                        <div className="flex-1 flex justify-start">
                            {supportsEyeDropper && (
                                <button
                                    type="button"
                                    onClick={handleEyeDropper}
                                    className="h-7 px-2 rounded flex items-center justify-center bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                    title="Pick color from screen"
                                >
                                    <Pipette className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                                </button>
                            )}
                        </div>
                        {/* Center: Color preview + hex input */}
                        <div className="flex-1 flex justify-center items-center gap-1">
                            <div
                                className="w-7 h-7 rounded shrink-0"
                                style={{ backgroundColor: value }}
                                title={value}
                            />
                            <input
                                type="text"
                                value={value}
                                onChange={(e) => onChange(e.target.value)}
                                className="w-16 h-7 px-1 font-mono text-xs text-center text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-600 rounded border-0 outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="#000000"
                            />
                        </div>
                        {/* Right: Mode toggle */}
                        <div className="flex-1 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setColorMode(colorMode === 'rgb' ? 'hsl' : 'rgb')}
                                className="h-7 px-2 text-xs font-medium rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                title="Toggle RGB/HSL"
                            >
                                {colorMode.toUpperCase()}
                            </button>
                        </div>
                    </div>

                    {/* Row 2: Value inputs */}
                    <div className="flex items-start gap-1 mt-2">
                        {colorMode === 'rgb' ? (
                            <>
                                <SpinInput value={rgb.r} min={0} max={255} onChange={(v) => handleRgbChange('r', v)} label="R" />
                                <SpinInput value={rgb.g} min={0} max={255} onChange={(v) => handleRgbChange('g', v)} label="G" />
                                <SpinInput value={rgb.b} min={0} max={255} onChange={(v) => handleRgbChange('b', v)} label="B" />
                            </>
                        ) : (
                            <>
                                <SpinInput value={hsl.h} min={0} max={360} onChange={(v) => handleHslChange('h', v)} label="H" />
                                <SpinInput value={hsl.s} min={0} max={100} onChange={(v) => handleHslChange('s', v)} label="S" />
                                <SpinInput value={hsl.l} min={0} max={100} onChange={(v) => handleHslChange('l', v)} label="L" />
                            </>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
});



