import { useSettingsStore } from "@/store/settings";
import { Button, Label } from "flowbite-react";
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

    if (compact) {
        return (
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 justify-between w-full">
                    <Button
                        size="xs"
                        className="w-full"
                        color="blue"
                        onClick={handleZoomOut}
                    >
                        <ZoomOut className="size-4" />
                    </Button>
                    <Label className="w-full text-center whitespace-nowrap">{zoom.toFixed(1)}x</Label>
                    <Button
                        size="xs"
                        className="w-full"
                        color="blue"
                        onClick={handleZoomIn}
                    >
                        <ZoomIn className="size-4" />
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 justify-between w-full">
                <Button
                    size="sm"
                    className="w-full"
                    color="blue"
                    onClick={handleZoomOut}
                >
                    <ZoomOut className="size-6" />
                </Button>
                <Label className="w-full text-center text-lg">{zoom.toFixed(1)}x</Label>
                <Button
                    size="sm"
                    className="w-full"
                    color="blue"
                    onClick={handleZoomIn}
                >
                    <ZoomIn className="size-6" />
                </Button>
            </div>
            <div className="relative w-full h-6 flex items-center">
                {/* Center Tick Mark (1x) */}
                <div className="absolute left-1/2 -translate-x-1/2 w-1 h-8 bg-gray-300 dark:bg-gray-600 rounded pointer-events-none" />

                <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={toSliderValue(zoom)}
                    onDoubleClick={handleResetZoom}
                    onTouchStart={handleTouchStart}
                    onChange={handleSliderChange}
                    className="zoom-slider w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer dark:bg-gray-600 accent-blue-600 relative z-10 touch-none"
                />
            </div>
        </div>
    );
}
