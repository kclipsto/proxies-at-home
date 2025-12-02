import { useSettingsStore } from "@/store/settings";
import { Label, Select, TextInput } from "flowbite-react";
import { NumberInput } from "../../NumberInput";
import { useNormalizedInput } from "@/hooks/useInputHooks";

export function GuidesSection() {
    const guideColor = useSettingsStore((state) => state.guideColor);
    const setGuideColor = useSettingsStore((state) => state.setGuideColor);
    const guideWidth = useSettingsStore((state) => state.guideWidth);
    const setGuideWidth = useSettingsStore((state) => state.setGuideWidth);
    const cutLineStyle = useSettingsStore((state) => state.cutLineStyle);
    const setCutLineStyle = useSettingsStore((state) => state.setCutLineStyle);

    const guideWidthInput = useNormalizedInput(
        guideWidth,
        setGuideWidth,
        { min: 0, max: 10 }
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
                    <Label htmlFor="guideWidth">Guide Width (mm)</Label>
                </div>
                <NumberInput
                    ref={guideWidthInput.inputRef}
                    id="guideWidth"
                    step={0.1}
                    defaultValue={guideWidthInput.defaultValue}
                    onChange={guideWidthInput.handleChange}
                    onBlur={guideWidthInput.handleBlur}
                />
            </div>

            <div>
                <div className="mb-2 block">
                    <Label htmlFor="cutLineStyle">Cut Line Style</Label>
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
