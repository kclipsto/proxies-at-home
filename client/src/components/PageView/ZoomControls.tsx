import { useSettingsStore } from "@/store/settings";
import { Button } from "flowbite-react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { useRef } from "react";

type ZoomControlsProps = {
    compact?: boolean;
    // Optional controlled zoom - if not provided, uses global settings store
    zoom?: number;
    onZoomChange?: (zoom: number) => void;
    // Optional range configuration
    minZoom?: number;
    maxZoom?: number;
};

/**
 * Reusable zoom controls component.
 * 
 * Can be used in two modes:
 * 1. **Uncontrolled (default)**: Uses global settings store for zoom
 * 2. **Controlled**: Pass `zoom` and `onZoomChange` props for local state
 */
export function ZoomControls({
    compact = false,
    zoom: controlledZoom,
    onZoomChange,
    minZoom = 0.1,
    maxZoom = 5.0,
}: ZoomControlsProps) {
    // Use controlled props if provided, otherwise fall back to global store
    const globalZoom = useSettingsStore((state) => state.zoom);
    const globalSetZoom = useSettingsStore((state) => state.setZoom);

    const isControlled = controlledZoom !== undefined && onZoomChange !== undefined;
    const zoom = isControlled ? controlledZoom : globalZoom;
    const setZoom = isControlled ? onZoomChange : globalSetZoom;

    const lastTapRef = useRef(0);
    const isDoubleTapRef = useRef(false);

    // Convert between slider value (0-100) and zoom value
    const toSliderValue = (z: number) => {
        // Map zoom to slider: minZoom-1 maps to 0-50, 1-maxZoom maps to 50-100
        if (z <= 1.0) return ((z - minZoom) / (1.0 - minZoom)) * 50;
        return 50 + ((z - 1.0) / (maxZoom - 1.0)) * 50;
    };

    const toZoomValue = (v: number) => {
        if (v <= 50) return minZoom + (v / 50) * (1.0 - minZoom);
        return 1.0 + ((v - 50) / 50) * (maxZoom - 1.0);
    };

    const handleZoomOut = () => setZoom(Math.max(minZoom, zoom - 0.1));
    const handleZoomIn = () => setZoom(Math.min(maxZoom, zoom + 0.1));
    const handleResetZoom = () => setZoom(1.0);

    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isDoubleTapRef.current) {
            isDoubleTapRef.current = false;
            return;
        }
        const val = parseInt(e.target.value, 10);

        // Define snap points
        const snapZooms: number[] = [];
        for (let z = minZoom; z < 1.0; z += 0.1) snapZooms.push(z);
        for (let z = 1.0; z <= maxZoom; z += 0.5) snapZooms.push(z);

        let newZoom = toZoomValue(val);

        // Check for snapping
        for (const snapZoom of snapZooms) {
            const snapSliderVal = toSliderValue(snapZoom);
            if (Math.abs(val - snapSliderVal) < 3) {
                newZoom = snapZoom;
                break;
            }
        }

        setZoom(newZoom);
    };

    const handleTouchStart = () => {
        const now = Date.now();
        const lastTap = lastTapRef.current;

        if (now - lastTap < 300) {
            // Double tap detected
            isDoubleTapRef.current = true;
            handleResetZoom();
            lastTapRef.current = 0;

            setTimeout(() => {
                isDoubleTapRef.current = false;
            }, 200);
        } else {
            lastTapRef.current = now;
        }
    };

    // Calculate thumb position as percentage
    const thumbPosition = toSliderValue(zoom);

    // Label Visual Pill Style
    // Located exactly at thumb center (calc logic ensures alignment)
    const labelStyle: React.CSSProperties = {
        left: `calc(${thumbPosition}% - ${thumbPosition * 0.16}px + 8px)`
    };

    // The Label becomes the visual thumb: Blue Pill
    // Vertically centered (top-1/2 -translate-y-1/2) over the track.
    const labelClasses = "absolute pointer-events-none top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 flex items-center justify-center bg-blue-600 text-white border border-blue-700 rounded-full shadow-sm text-base font-bold px-3 py-1";

    // Hide the native thumb visually so the label acts as the thumb
    // We use utility classes to target the thumb pseudo-elements
    const sliderClasses = "zoom-slider w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer dark:bg-gray-600 relative z-10 touch-none [&::-webkit-slider-thumb]:opacity-0 [&::-moz-range-thumb]:opacity-0 [&::-webkit-slider-thumb]:w-10 [&::-webkit-slider-thumb]:h-6";

    if (compact) {
        return (
            <div className="flex items-center gap-2">
                <Button
                    size="xs"
                    color="blue"
                    onClick={handleZoomOut}
                    className="shrink-0 aspect-square p-0 flex items-center justify-center"
                >
                    <ZoomOut className="size-4" />
                </Button>
                <div className="relative flex-1 h-8 flex items-center min-w-[100px] mx-4">
                    {/* The Visual Thumb (Label) */}
                    <div
                        className={labelClasses}
                        style={labelStyle}
                    >
                        {zoom.toFixed(1)}x
                    </div>

                    <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={thumbPosition}
                        onDoubleClick={handleResetZoom}
                        onTouchStart={handleTouchStart}
                        onChange={handleSliderChange}
                        className={sliderClasses}
                    />
                </div>
                <Button
                    size="xs"
                    color="blue"
                    onClick={handleZoomIn}
                    className="shrink-0 aspect-square p-0 flex items-center justify-center"
                >
                    <ZoomIn className="size-4" />
                </Button>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-3">
            <Button
                size="sm"
                color="blue"
                onClick={handleZoomOut}
                className="shrink-0 aspect-square p-0 flex items-center justify-center"
            >
                <ZoomOut className="size-5" />
            </Button>
            <div className="relative flex-1 h-10 flex items-center min-w-[120px] mx-4">
                {/* Center Tick Mark (1x) */}
                <div className="absolute left-1/2 -translate-x-1/2 w-1 h-10 bg-gray-400 dark:bg-gray-500 rounded pointer-events-none" />

                {/* The Visual Thumb (Label) */}
                <div
                    className={labelClasses}
                    style={labelStyle}
                >
                    {zoom.toFixed(1)}x
                </div>

                <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={thumbPosition}
                    onDoubleClick={handleResetZoom}
                    onTouchStart={handleTouchStart}
                    onChange={handleSliderChange}
                    className={sliderClasses}
                />
            </div>
            <Button
                size="sm"
                color="blue"
                onClick={handleZoomIn}
                className="shrink-0 aspect-square p-0 flex items-center justify-center"
            >
                <ZoomIn className="size-5" />
            </Button>
        </div>
    );
}
