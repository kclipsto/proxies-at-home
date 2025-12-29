import { useSettingsStore } from "@/store/settings";
import { Label, Select } from "flowbite-react";
import { NumberInput } from "@/components/common";
import { useNormalizedInput } from "@/hooks/useInputHooks";
import { useEffect, useState } from "react";
import { AutoTooltip } from "@/components/common";
import { ColorPicker } from "../../common/ColorPicker";
import { StyledSlider } from "../../common/StyledSlider";

export function GuidesSection() {
    const guideColor = useSettingsStore((state) => state.guideColor);
    const setGuideColor = useSettingsStore((state) => state.setGuideColor);
    const guideWidth = useSettingsStore((state) => state.guideWidth);
    const setGuideWidth = useSettingsStore((state) => state.setGuideWidth);
    const cutLineStyle = useSettingsStore((state) => state.cutLineStyle);
    const setCutLineStyle = useSettingsStore((state) => state.setCutLineStyle);
    const perCardGuideStyle = useSettingsStore((state) => state.perCardGuideStyle);
    const setPerCardGuideStyle = useSettingsStore((state) => state.setPerCardGuideStyle);
    const guidePlacement = useSettingsStore((state) => state.guidePlacement);
    const setGuidePlacement = useSettingsStore((state) => state.setGuidePlacement);
    const cutGuideLengthMm = useSettingsStore((state) => state.cutGuideLengthMm);
    const setCutGuideLengthMm = useSettingsStore((state) => state.setCutGuideLengthMm);

    const bleedEdge = useSettingsStore((state) => state.bleedEdge);
    const bleedEdgeWidth = useSettingsStore((state) => state.bleedEdgeWidth);
    const cardSpacingMm = useSettingsStore((state) => state.cardSpacingMm);

    // Local state for color picker - sync with store for live preview
    const [localColor, setLocalColor] = useState(guideColor);

    // Sync local state when store changes externally (e.g., undo/redo)
    useEffect(() => {
        setLocalColor(guideColor);
    }, [guideColor]);

    // Max guide width is limited by the space between cards so they don't overlap
    // Space between cut lines = Spacing + 2 * Bleed (if bleed enabled)
    // Max width per guide (growing outward) = (Spacing + 2 * Bleed) / 2 = Spacing/2 + Bleed
    // Convert to pixels at 96 DPI (CSS pixels): (mm) * (96/25.4)
    const availableSpace = bleedEdge ? (cardSpacingMm / 2 + bleedEdgeWidth) : (cardSpacingMm / 2);
    const maxGuideWidth = Math.floor(availableSpace * (96 / 25.4));

    // Check if there's enough space for outside guides (need at least guideWidth space)
    const canUseOutside = maxGuideWidth >= guideWidth && maxGuideWidth > 0;

    // Enforce inside placement when there's not enough space
    useEffect(() => {
        if (!canUseOutside && guidePlacement === 'outside') {
            setGuidePlacement('inside');
        }
    }, [canUseOutside, guidePlacement, setGuidePlacement]);

    const guideWidthInput = useNormalizedInput(
        guideWidth,
        setGuideWidth,
        { min: 0, max: maxGuideWidth }
    );

    // Check if using corner styles (not full rect)
    const isCornerStyle = perCardGuideStyle.includes('corner');
    return (
        <div className="space-y-4">
            <ColorPicker
                label="Guide Color"
                value={localColor}
                onChange={(color) => {
                    setLocalColor(color);
                    // Live preview without undo tracking
                    useSettingsStore.setState({ guideColor: color });
                }}
                onChangeEnd={(color, previousColor) => {
                    // Record undo action for the complete change
                    useSettingsStore.setState({ guideColor: previousColor });
                    setGuideColor(color);
                }}
            />

            <div>
                <div className="mb-2 block">
                    <Label htmlFor="guideWidth">Guide Width (px)</Label>
                </div>
                <NumberInput
                    ref={guideWidthInput.inputRef}
                    id="guideWidth"
                    step={1}
                    defaultValue={guideWidthInput.defaultValue}
                    onChange={guideWidthInput.handleChange}
                    onBlur={guideWidthInput.handleBlur}
                />
            </div>

            <div>
                <div className="mb-2 flex items-center gap-2">
                    <Label htmlFor="guidePlacement">Placement</Label>
                    <AutoTooltip content="Controls which side of the cut line the guides appear on. Outside places strokes in the bleed area, Inside places them within the card content, Center straddles the cut line." />
                </div>
                <div className="grid grid-cols-4 gap-2">
                    {/* Outside icon - L corners clearly OUTSIDE the card */}
                    <button
                        onClick={() => setGuidePlacement('outside')}
                        disabled={!canUseOutside}
                        className={`aspect-square h-10 p-1 rounded transition-colors flex items-center justify-center ${guidePlacement === 'outside'
                            ? 'bg-blue-100 dark:bg-blue-600'
                            : canUseOutside
                                ? 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                                : 'bg-gray-100 dark:bg-gray-700 opacity-50 cursor-not-allowed'
                            }`}
                        title="Outside - stroke in bleed area"
                    >
                        <svg width="30" height="40" viewBox="0 0 32 40" className="mx-auto">
                            {/* Card at (2,2) with 28x36 - same as card cut guide icons */}
                            <rect x="2" y="2" width="28" height="36" className="fill-gray-300 dark:fill-gray-500" />
                            {/* Guide stroke clearly outside - at viewBox edges */}
                            <path d="M0,8 L0,0 L8,0" fill="none" stroke={localColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M32,8 L32,0 L24,0" fill="none" stroke={localColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M0,32 L0,40 L8,40" fill="none" stroke={localColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M32,32 L32,40 L24,40" fill="none" stroke={localColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                    {/* Center icon - L corners exactly ON the card edge */}
                    <button
                        onClick={() => setGuidePlacement('center')}
                        className={`aspect-square h-10 p-1 rounded transition-colors flex items-center justify-center ${guidePlacement === 'center'
                            ? 'bg-blue-100 dark:bg-blue-600'
                            : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                        title="Center - stroke straddles cut line"
                    >
                        <svg width="30" height="40" viewBox="0 0 32 40" className="mx-auto">
                            {/* Card at (2,2) with 28x36 - same as card cut guide icons */}
                            <rect x="2" y="2" width="28" height="36" className="fill-gray-300 dark:fill-gray-500" />
                            {/* Guide stroke on card edge - vertex at card corners */}
                            <path d="M2,10 L2,2 L10,2" fill="none" stroke={localColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M30,10 L30,2 L22,2" fill="none" stroke={localColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M2,30 L2,38 L10,38" fill="none" stroke={localColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M30,30 L30,38 L22,38" fill="none" stroke={localColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                    {/* Inside icon - L corners clearly INSIDE the card */}
                    <button
                        onClick={() => setGuidePlacement('inside')}
                        className={`aspect-square h-10 p-1 rounded transition-colors flex items-center justify-center ${guidePlacement === 'inside'
                            ? 'bg-blue-100 dark:bg-blue-600'
                            : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                        title="Inside - stroke within card content"
                    >
                        <svg width="30" height="40" viewBox="0 0 32 40" className="mx-auto">
                            {/* Card at (2,2) with 28x36 - same as card cut guide icons */}
                            <rect x="2" y="2" width="28" height="36" className="fill-gray-300 dark:fill-gray-500" />
                            {/* Guide stroke inside - offset +2 from card cut guide paths */}
                            <path d="M6,6 L6,12 M6,6 L12,6" fill="none" stroke={localColor} strokeWidth="2" />
                            <path d="M26,6 L26,12 M26,6 L20,6" fill="none" stroke={localColor} strokeWidth="2" />
                            <path d="M6,34 L6,28 M6,34 L12,34" fill="none" stroke={localColor} strokeWidth="2" />
                            <path d="M26,34 L26,28 M26,34 L20,34" fill="none" stroke={localColor} strokeWidth="2" />
                        </svg>
                    </button>
                </div>
            </div>

            <div>
                <div className="mb-2 block">
                    <Label htmlFor="perCardGuideStyle">Card Cut Guides</Label>
                </div>

                {/* Toggle-based guide style selector */}
                {perCardGuideStyle === 'none' ? (
                    <button
                        onClick={() => setPerCardGuideStyle('corners')}
                        className="w-full px-4 py-2 text-sm font-medium rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500"
                    >
                        Enable Card Guides
                    </button>
                ) : (
                    <div className="space-y-2">
                        {/* Quick Presets - 2 rows: Square (top), Rounded (bottom) */}
                        <div className="grid grid-cols-4 gap-2 pb-2 border-b border-gray-200 dark:border-gray-600">
                            {([
                                // Row 1: Square variants
                                {
                                    style: 'corners', title: 'Square Corners - Solid', paths: [
                                        { d: 'M4,4 L4,10 M4,4 L10,4' },
                                        { d: 'M24,4 L24,10 M24,4 L18,4' },
                                        { d: 'M4,32 L4,26 M4,32 L10,32' },
                                        { d: 'M24,32 L24,26 M24,32 L18,32' }
                                    ]
                                },
                                {
                                    style: 'dashed-corners', title: 'Square Corners - Dashed', paths: [
                                        { d: 'M4,4 L4,10 M4,4 L10,4', dash: '2,2' },
                                        { d: 'M24,4 L24,10 M24,4 L18,4', dash: '2,2' },
                                        { d: 'M4,32 L4,26 M4,32 L10,32', dash: '2,2' },
                                        { d: 'M24,32 L24,26 M24,32 L18,32', dash: '2,2' }
                                    ]
                                },
                                { style: 'solid-squared-rect', title: 'Square Full - Solid', rect: { x: 4, y: 4, w: 20, h: 28 } },
                                { style: 'dashed-squared-rect', title: 'Square Full - Dashed', rect: { x: 4, y: 4, w: 20, h: 28, dash: '4,3' } },
                                // Row 2: Rounded variants
                                {
                                    style: 'rounded-corners', title: 'Rounded Corners - Solid', paths: [
                                        { d: 'M4,12 Q4,4 12,4' },
                                        { d: 'M16,4 Q24,4 24,12' },
                                        { d: 'M4,24 Q4,32 12,32' },
                                        { d: 'M16,32 Q24,32 24,24' }
                                    ]
                                },
                                {
                                    style: 'dashed-rounded-corners', title: 'Rounded Corners - Dashed', paths: [
                                        { d: 'M4,12 Q4,4 12,4', dash: '2,2' },
                                        { d: 'M16,4 Q24,4 24,12', dash: '2,2' },
                                        { d: 'M4,24 Q4,32 12,32', dash: '2,2' },
                                        { d: 'M16,32 Q24,32 24,24', dash: '2,2' }
                                    ]
                                },
                                { style: 'solid-rounded-rect', title: 'Rounded Full - Solid', rect: { x: 4, y: 4, w: 20, h: 28, rx: 5 } },
                                { style: 'dashed-rounded-rect', title: 'Rounded Full - Dashed', rect: { x: 4, y: 4, w: 20, h: 28, rx: 5, dash: '4,3' } },
                            ] as Array<{
                                style: Parameters<typeof setPerCardGuideStyle>[0];
                                title: string;
                                paths?: Array<{ d: string; dash?: string }>;
                                rect?: { x: number; y: number; w: number; h: number; rx?: number; dash?: string };
                            }>).map((config) => (
                                <button
                                    key={config.style}
                                    onClick={() => setPerCardGuideStyle(config.style)}
                                    className={`p-1 rounded transition-colors ${perCardGuideStyle === config.style
                                        ? 'bg-blue-100 dark:bg-blue-600'
                                        : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                                        }`}
                                    title={config.title}
                                >
                                    <svg width="28" height="36" viewBox="0 0 28 36" className="mx-auto">
                                        <rect x="0" y="0" width="28" height="36" className="fill-gray-300 dark:fill-gray-500" />
                                        {config.paths?.map((p, i) => (
                                            <path key={i} d={p.d} fill="none" stroke={localColor} strokeWidth="2" strokeDasharray={p.dash} />
                                        ))}
                                        {config.rect && (
                                            <rect x={config.rect.x} y={config.rect.y} width={config.rect.w} height={config.rect.h} rx={config.rect.rx} fill="none" stroke={localColor} strokeWidth="2" strokeDasharray={config.rect.dash} />
                                        )}
                                    </svg>
                                </button>
                            ))}
                        </div>

                        {/* Coverage: Corners / Full */}
                        <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
                            <button
                                onClick={() => {
                                    const isRound = perCardGuideStyle.includes('rounded');
                                    const isDashed = perCardGuideStyle.includes('dashed');
                                    if (isRound) {
                                        setPerCardGuideStyle(isDashed ? 'dashed-rounded-corners' : 'rounded-corners');
                                    } else {
                                        setPerCardGuideStyle(isDashed ? 'dashed-corners' : 'corners');
                                    }
                                }}
                                className={`flex-1 px-3 py-1.5 text-sm font-medium transition-colors ${perCardGuideStyle.includes('corner')
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                            >
                                Corners
                            </button>
                            <button
                                onClick={() => {
                                    const isRound = perCardGuideStyle.includes('rounded');
                                    const isDashed = perCardGuideStyle.includes('dashed');
                                    if (isRound) {
                                        setPerCardGuideStyle(isDashed ? 'dashed-rounded-rect' : 'solid-rounded-rect');
                                    } else {
                                        setPerCardGuideStyle(isDashed ? 'dashed-squared-rect' : 'solid-squared-rect');
                                    }
                                }}
                                className={`flex-1 px-3 py-1.5 text-sm font-medium transition-colors ${perCardGuideStyle.includes('rect')
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                            >
                                Full
                            </button>
                        </div>

                        {/* Line Style: Solid / Dashed */}
                        <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
                            <button
                                onClick={() => {
                                    const isRound = perCardGuideStyle.includes('rounded');
                                    const isCorners = perCardGuideStyle.includes('corner');
                                    if (isCorners) {
                                        setPerCardGuideStyle(isRound ? 'rounded-corners' : 'corners');
                                    } else {
                                        setPerCardGuideStyle(isRound ? 'solid-rounded-rect' : 'solid-squared-rect');
                                    }
                                }}
                                className={`flex-1 px-3 py-1.5 text-sm font-medium transition-colors ${!perCardGuideStyle.includes('dashed')
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                            >
                                Solid
                            </button>
                            <button
                                onClick={() => {
                                    const isRound = perCardGuideStyle.includes('rounded');
                                    const isCorners = perCardGuideStyle.includes('corner');
                                    if (isCorners) {
                                        setPerCardGuideStyle(isRound ? 'dashed-rounded-corners' : 'dashed-corners');
                                    } else {
                                        setPerCardGuideStyle(isRound ? 'dashed-rounded-rect' : 'dashed-squared-rect');
                                    }
                                }}
                                className={`flex-1 px-3 py-1.5 text-sm font-medium transition-colors ${perCardGuideStyle.includes('dashed')
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                            >
                                Dashed
                            </button>
                        </div>

                        {/* Shape: Square / Round */}
                        <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
                            <button
                                onClick={() => {
                                    const isDashed = perCardGuideStyle.includes('dashed');
                                    const isCorners = perCardGuideStyle.includes('corner');
                                    if (isCorners) {
                                        setPerCardGuideStyle(isDashed ? 'dashed-corners' : 'corners');
                                    } else {
                                        setPerCardGuideStyle(isDashed ? 'dashed-squared-rect' : 'solid-squared-rect');
                                    }
                                }}
                                className={`flex-1 px-3 py-1.5 text-sm font-medium transition-colors ${!perCardGuideStyle.includes('rounded')
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                            >
                                Square
                            </button>
                            <button
                                onClick={() => {
                                    const isDashed = perCardGuideStyle.includes('dashed');
                                    const isCorners = perCardGuideStyle.includes('corner');
                                    if (isCorners) {
                                        setPerCardGuideStyle(isDashed ? 'dashed-rounded-corners' : 'rounded-corners');
                                    } else {
                                        setPerCardGuideStyle(isDashed ? 'dashed-rounded-rect' : 'solid-rounded-rect');
                                    }
                                }}
                                className={`flex-1 px-3 py-1.5 text-sm font-medium transition-colors ${perCardGuideStyle.includes('rounded')
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                            >
                                Round
                            </button>
                        </div>

                        {/* Guide Length slider - only for corner styles */}
                        {isCornerStyle && (
                            <div className="my-5">
                                <div className="mb-1 flex items-center gap-2">
                                    <Label htmlFor="cutGuideLengthMm">Guide Length</Label>
                                    <AutoTooltip content="Controls how far the corner guides extend along the card edge. Shorter guides are easier to hide if not cut perfectly." />
                                </div>
                                <StyledSlider
                                    label=""
                                    value={cutGuideLengthMm}
                                    onChange={setCutGuideLengthMm}
                                    min={1}
                                    max={10}
                                    step={0.1}
                                    displayValue={`${cutGuideLengthMm.toFixed(2)}mm`}
                                    defaultValue={6.25}
                                />
                            </div>
                        )}

                        {/* Disable button */}
                        <button
                            onClick={() => setPerCardGuideStyle('none')}
                            className="w-full px-4 py-2 text-sm font-medium rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500"
                        >
                            Disable Card Guides
                        </button>
                    </div>
                )}
            </div>

            <div>
                <div className="mb-2 block">
                    <Label htmlFor="cutLineStyle">Page Cut Guides</Label>
                </div>
                <Select
                    id="cutLineStyle"
                    value={cutLineStyle}
                    onChange={(e) =>
                        setCutLineStyle(
                            e.target.value as "full" | "edges" | "none"
                        )
                    }
                >
                    <option value="full">Full Lines</option>
                    <option value="edges">Edges Only</option>
                    <option value="none">None</option>
                </Select>
            </div>
        </div>
    );
}
