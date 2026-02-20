import { useSettingsStore } from "@/store/settings";
import { Label, Checkbox, Button } from "flowbite-react";
import { NumberInput } from "@/components/common";
import { useNormalizedInput, usePositionInput } from "@/hooks/useInputHooks";
import { AutoTooltip } from "@/components/common";
import { useMemo, useState } from "react";
import { PerCardOffsetModal } from "@/components/PerCardOffsetModal";
import { WrenchIcon } from "lucide-react";
import { CONSTANTS } from "@/constants/commonConstants";

export function CardSection() {
    const columns = useSettingsStore((state) => state.columns);
    const rows = useSettingsStore((state) => state.rows);
    const bleedEdgeWidth = useSettingsStore((state) => state.bleedEdgeWidth);
    const bleedEdge = useSettingsStore((state) => state.bleedEdge);
    const pageWidth = useSettingsStore((state) => state.pageWidth);
    const pageHeight = useSettingsStore((state) => state.pageHeight);
    const pageUnit = useSettingsStore((state) => state.pageSizeUnit);
    const cardSpacingMm = useSettingsStore((state) => state.cardSpacingMm);
    const cardPositionX = useSettingsStore((state) => state.cardPositionX);
    const cardPositionY = useSettingsStore((state) => state.cardPositionY);
    const useCustomBackOffset = useSettingsStore((state) => state.useCustomBackOffset);
    const cardBackPositionX = useSettingsStore((state) => state.cardBackPositionX);
    const cardBackPositionY = useSettingsStore((state) => state.cardBackPositionY);

    const setCardSpacingMm = useSettingsStore((state) => state.setCardSpacingMm);
    const setCardPositionX = useSettingsStore((state) => state.setCardPositionX);
    const setCardPositionY = useSettingsStore((state) => state.setCardPositionY);
    const setUseCustomBackOffset = useSettingsStore((state) => state.setUseCustomBackOffset);
    const setCardBackPositionX = useSettingsStore((state) => state.setCardBackPositionX);
    const setCardBackPositionY = useSettingsStore((state) => state.setCardBackPositionY);

    const [showPerCardModal, setShowPerCardModal] = useState(false);

    const pageWmm = pageUnit === "mm" ? pageWidth : pageWidth * CONSTANTS.MM_PER_IN;
    const pageHmm = pageUnit === "mm" ? pageHeight : pageHeight * CONSTANTS.MM_PER_IN;

    const cardWmm = CONSTANTS.CARD_WIDTH_MM + (bleedEdge ? 2 * bleedEdgeWidth : 0);
    const cardHmm = CONSTANTS.CARD_HEIGHT_MM + (bleedEdge ? 2 * bleedEdgeWidth : 0);

    const maxSpacingMm = useMemo(() => {
        const xDen = Math.max(1, columns - 1);
        const yDen = Math.max(1, rows - 1);

        const roomX = pageWmm - columns * cardWmm;
        const roomY = pageHmm - rows * cardHmm;

        const maxX = xDen > 0 ? Math.floor(Math.max(0, roomX / xDen)) : 0;
        const maxY = yDen > 0 ? Math.floor(Math.max(0, roomY / yDen)) : 0;

        return Math.floor(Math.min(maxX, maxY));
    }, [pageWmm, pageHmm, columns, rows, cardWmm, cardHmm]);

    const cardSpacingInput = useNormalizedInput(
        cardSpacingMm,
        (value) => setCardSpacingMm(value),
        { min: 0, max: maxSpacingMm }
    );

    const cardPositionXInput = usePositionInput(cardPositionX, setCardPositionX);
    const cardPositionYInput = usePositionInput(cardPositionY, setCardPositionY);
    const cardBackPositionXInput = usePositionInput(cardBackPositionX, setCardBackPositionX);
    const cardBackPositionYInput = usePositionInput(cardBackPositionY, setCardBackPositionY);

    return (
        <div className="space-y-4">
            <div className="flex flex-col space-y-2">
                <Label className="font-bold">Advanced Positioning</Label>
                <div className="flex items-center gap-2 pt-2">
                    <Button
                        color="green"
                        onClick={() => setShowPerCardModal(true)}
                        className="flex-1 gap-2"
                    >
                        <WrenchIcon className="h-5 w-5" />
                        Card Back Alignement Tool
                    </Button>
                    <AutoTooltip content="Adjust position and rotation for each card back individually. Use this to fine-tune alignment for each position in the grid." />
                </div>
            </div>

            <div>

                <div className="flex flex-col space-y-2">
                    <Label className="font-bold">Basic Positioning</Label>
                    <div className="flex items-center justify-between relative">
                        <Label>Card Spacing (mm)</Label>
                        {cardSpacingInput.warning && (
                            <span className="absolute right-8 text-xs text-red-500 font-medium animate-pulse">
                                {cardSpacingInput.warning}
                            </span>
                        )}
                        <AutoTooltip
                            content={
                                <div className="whitespace-nowrap">
                                    Max that fits with current layout: {maxSpacingMm} mm
                                </div>
                            }
                        />
                    </div>
                </div>
                <NumberInput
                    ref={cardSpacingInput.inputRef}
                    className="w-full"
                    min={0}
                    step={0.5}
                    defaultValue={cardSpacingInput.defaultValue}
                    onChange={cardSpacingInput.handleChange}
                    onBlur={cardSpacingInput.handleBlur}
                    placeholder={cardSpacingMm.toString()}
                />
            </div>

            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <Label>Card Position Adjustment (mm)</Label>
                    <AutoTooltip content="Adjust card position for perfect printer alignment. Use small values (0.1-2.0mm) for fine-tuning." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <div className="flex items-center justify-between">
                            <Label>Horizontal Offset</Label>
                            <AutoTooltip content="Positive = right, negative = left" />
                        </div>
                        <NumberInput
                            ref={cardPositionXInput.inputRef}
                            className="w-full"
                            step={0.1}
                            defaultValue={cardPositionXInput.defaultValue}
                            onChange={cardPositionXInput.handleChange}
                            onBlur={cardPositionXInput.handleBlur}
                            placeholder="-0.0"
                        />
                    </div>
                    <div>
                        <div className="flex items-center justify-between">
                            <Label>Vertical Offset</Label>
                            <AutoTooltip content="Positive = down, negative = up" />
                        </div>
                        <NumberInput
                            ref={cardPositionYInput.inputRef}
                            className="w-full"
                            step={0.1}
                            defaultValue={cardPositionYInput.defaultValue}
                            onChange={cardPositionYInput.handleChange}
                            onBlur={cardPositionYInput.handleBlur}
                            placeholder="-0.0"
                        />
                    </div>
                </div>
            </div>

            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <Checkbox
                        id="useCustomBackOffset"
                        checked={useCustomBackOffset}
                        onChange={(e) => setUseCustomBackOffset(e.target.checked)}
                    />
                    <Label htmlFor="useCustomBackOffset" className="cursor-pointer select-none">
                        Separate Back Offset
                    </Label>
                    <AutoTooltip content="Use different offsets for back cards (useful for printer alignment in duplex printing). Applies to Backs-only exports and Duplex mode back pages." />
                </div>

                {useCustomBackOffset && (
                    <>
                        <div className="grid grid-cols-2 gap-3 border-gray-200 dark:border-gray-700">
                            <div>
                                <div className="flex items-center justify-between">
                                    <Label>Back Horizontal</Label>
                                </div>
                                <NumberInput
                                    ref={cardBackPositionXInput.inputRef}
                                    className="w-full"
                                    step={0.1}
                                    defaultValue={cardBackPositionXInput.defaultValue}
                                    onChange={cardBackPositionXInput.handleChange}
                                    onBlur={cardBackPositionXInput.handleBlur}
                                    placeholder="-0.0"
                                />
                            </div>
                            <div>
                                <div className="flex items-center justify-between">
                                    <Label>Back Vertical</Label>
                                </div>
                                <NumberInput
                                    ref={cardBackPositionYInput.inputRef}
                                    className="w-full"
                                    step={0.1}
                                    defaultValue={cardBackPositionYInput.defaultValue}
                                    onChange={cardBackPositionYInput.handleChange}
                                    onBlur={cardBackPositionYInput.handleBlur}
                                    placeholder="-0.0"
                                />
                            </div>
                        </div>

                    </>
                )}
            </div>

            <PerCardOffsetModal
                isOpen={showPerCardModal}
                onClose={() => setShowPerCardModal(false)}
            />
        </div>
    );
}
