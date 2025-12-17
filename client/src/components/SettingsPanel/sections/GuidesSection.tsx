import { useSettingsStore } from "@/store/settings";
import { Label, Radio, Select, TextInput } from "flowbite-react";
import { NumberInput } from "../../NumberInput";
import { useNormalizedInput } from "@/hooks/useInputHooks";
import { useEffect, useState, useRef } from "react";
import { AutoTooltip } from "../../AutoTooltip";

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

    const bleedEdge = useSettingsStore((state) => state.bleedEdge);
    const bleedEdgeWidth = useSettingsStore((state) => state.bleedEdgeWidth);
    const cardSpacingMm = useSettingsStore((state) => state.cardSpacingMm);

    // Local state for color picker - updates live preview without undo spam
    const [localColor, setLocalColor] = useState(guideColor);
    const colorBeforeDrag = useRef(guideColor);
    const isDragging = useRef(false);

    // Sync local state when store changes externally (e.g., undo/redo)
    useEffect(() => {
        if (!isDragging.current) {
            setLocalColor(guideColor);
        }
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

    const handleColorInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Track that we're dragging
        if (!isDragging.current) {
            isDragging.current = true;
            colorBeforeDrag.current = guideColor;
        }
        setLocalColor(e.target.value);
        // Update store directly without undo tracking for live preview
        useSettingsStore.setState({ guideColor: e.target.value });
    };

    const handleColorInputComplete = () => {
        if (isDragging.current && colorBeforeDrag.current !== localColor) {
            // Now record a single undo action for the entire drag
            // Temporarily restore old value then set new value to trigger undo recording
            useSettingsStore.setState({ guideColor: colorBeforeDrag.current });
            setGuideColor(localColor);
        }
        isDragging.current = false;
    };

    return (
        <div className="space-y-4">
            <div>
                <div className="mb-2 block">
                    <Label htmlFor="guideColor">Guide Color</Label>
                </div>
                <div className="flex gap-2">
                    <div className="flex-1 h-10 relative overflow-hidden rounded-lg border border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-700">
                        <input
                            id="guideColor"
                            type="color"
                            className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] p-0 border-none cursor-pointer bg-transparent"
                            value={localColor}
                            onChange={handleColorInputChange}
                            onBlur={handleColorInputComplete}
                            onMouseUp={handleColorInputComplete}
                        />
                    </div>
                    <TextInput
                        type="text"
                        className="w-24"
                        value={localColor}
                        onChange={(e) => {
                            setLocalColor(e.target.value);
                            setGuideColor(e.target.value);
                        }}
                    />
                </div>
            </div>

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
                    <Label htmlFor="guidePlacement">Guide Placement</Label>
                    <AutoTooltip content="Controls which side of the cut line the guides appear on. Defaults to inside if there's not enough bleed or spacing." />
                </div>
                <div className="flex items-center gap-4">
                    <label className={`flex items-center gap-2 ${canUseOutside ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                        <Radio
                            name="guidePlacement"
                            value="outside"
                            checked={guidePlacement === 'outside'}
                            disabled={!canUseOutside}
                            onChange={() => setGuidePlacement('outside')}
                        />
                        <span className={`text-sm ${guidePlacement === 'outside' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>Outside</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <Radio
                            name="guidePlacement"
                            value="inside"
                            checked={guidePlacement === 'inside'}
                            onChange={() => setGuidePlacement('inside')}
                        />
                        <span className={`text-sm ${guidePlacement === 'inside' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>Inside</span>
                    </label>
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
