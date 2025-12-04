import { useSettingsStore } from "@/store/settings";
import { Label, Select, TextInput, Tooltip, ToggleSwitch } from "flowbite-react";
import { NumberInput } from "../../NumberInput";
import { useNormalizedInput } from "@/hooks/useInputHooks";
import { HelpCircle } from "lucide-react";
import { useEffect } from "react";

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
                            value={guideColor}
                            onChange={(e) => setGuideColor(e.target.value)}
                        />
                    </div>
                    <TextInput
                        type="text"
                        className="w-24"
                        value={guideColor}
                        onChange={(e) => setGuideColor(e.target.value)}
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
                    <Tooltip content="Controls which side of the cut line the guides appear on. Defaults to inside if there's not enough bleed or spacing.">
                        <HelpCircle className="w-4 h-4 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 cursor-pointer" />
                    </Tooltip>
                </div>
                <div className="flex items-center gap-3">
                    <span className={`text-sm text-gray-700 dark:text-gray-300 ${guidePlacement === 'inside' ? 'font-semibold' : 'font-normal'}`}>Inside</span>
                    <div style={{ ['--tw-translate-y' as string]: '0' }} className="[&_button]:!translate-y-0 [&_*]:!translate-y-0">
                        <ToggleSwitch
                            checked={guidePlacement === 'outside'}
                            disabled={!canUseOutside}
                            onChange={(checked) => setGuidePlacement(checked ? 'outside' : 'inside')}
                        />
                    </div>
                    <span className={`text-sm ${canUseOutside ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'} ${guidePlacement === 'outside' ? 'font-semibold' : 'font-normal'}`}>Outside</span>
                </div>
            </div>

            <div>
                <div className="mb-2 block">
                    <Label htmlFor="perCardGuideStyle">Card Cut Guides</Label>
                </div>
                <Select
                    id="perCardGuideStyle"
                    value={perCardGuideStyle}
                    onChange={(e) =>
                        setPerCardGuideStyle(
                            e.target.value as "corners" | "rounded-corners" | "dashed-squared-rect" | "solid-squared-rect" | "dashed-rounded-rect" | "solid-rounded-rect" | "none"
                        )
                    }
                >
                    <option value="corners">Squared Corner</option>
                    <option value="rounded-corners">Rounded Corner</option>
                    <option value="dashed-squared-rect">Dashed Squared Rectangle</option>
                    <option value="solid-squared-rect">Solid Squared Rectangle</option>
                    <option value="dashed-rounded-rect">Dashed Rounded Rectangle</option>
                    <option value="solid-rounded-rect">Solid Rounded Rectangle</option>
                    <option value="none">None</option>
                </Select>
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
