import { useSettingsStore } from "@/store/settings";
import { Button, Label } from "flowbite-react";
import { ZoomIn, ZoomOut } from "lucide-react";

type ZoomControlsProps = {
    compact?: boolean;
};

export function ZoomControls({ compact = false }: ZoomControlsProps) {
    const zoom = useSettingsStore((state) => state.zoom);
    const setZoom = useSettingsStore((state) => state.setZoom);

    if (compact) {
        return (
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 justify-between w-full">
                    <Button
                        size="xs"
                        className="w-full"
                        color="blue"
                        onClick={() => setZoom(Math.max(0.1, zoom - 0.1))}
                    >
                        <ZoomOut className="size-4" />
                    </Button>
                    <Label className="w-full text-center whitespace-nowrap">{zoom.toFixed(1)}x</Label>
                    <Button
                        size="xs"
                        className="w-full"
                        color="blue"
                        onClick={() => setZoom(zoom + 0.1)}
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
                    size="xs"
                    className="w-full"
                    color="blue"
                    onClick={() => setZoom(Math.max(0.1, zoom - 0.1))}
                >
                    <ZoomOut className="size-4" />
                </Button>
                <Label className="w-full text-center">{zoom.toFixed(1)}x</Label>
                <Button
                    size="xs"
                    className="w-full"
                    color="blue"
                    onClick={() => setZoom(zoom + 0.1)}
                >
                    <ZoomIn className="size-4" />
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
                    value={(() => {
                        if (zoom <= 1.0) return ((zoom - 0.1) / 0.9) * 50;
                        return 50 + ((zoom - 1.0) / 4.0) * 50;
                    })()}
                    onDoubleClick={() => setZoom(1.0)}
                    onChange={(e) => {
                        const val = parseInt(e.target.value, 10);

                        // Helper to convert slider value to zoom
                        const toZoom = (v: number) => {
                            if (v <= 50) return 0.1 + (v / 50) * 0.9;
                            return 1.0 + ((v - 50) / 50) * 4.0;
                        };

                        // Helper to convert zoom to slider value
                        const toSlider = (z: number) => {
                            if (z <= 1.0) return ((z - 0.1) / 0.9) * 50;
                            return 50 + ((z - 1.0) / 4.0) * 50;
                        };

                        // Define snap points
                        const snapZooms: number[] = [];
                        for (let z = 0.1; z < 1.0; z += 0.1) snapZooms.push(z);
                        for (let z = 1.0; z <= 5.0; z += 0.5) snapZooms.push(z);

                        let newZoom = toZoom(val);

                        // Check for snapping
                        for (const snapZoom of snapZooms) {
                            const snapSliderVal = toSlider(snapZoom);
                            if (Math.abs(val - snapSliderVal) < 3) {
                                newZoom = snapZoom;
                                break;
                            }
                        }

                        setZoom(newZoom);
                    }}
                    className="zoom-slider w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer dark:bg-gray-600 accent-blue-600 relative z-10"
                />
            </div>
        </div>
    );
}
