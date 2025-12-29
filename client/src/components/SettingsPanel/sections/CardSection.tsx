import { useSettingsStore } from "@/store/settings";
import { Label } from "flowbite-react";
import { NumberInput } from "@/components/common";
import { useNormalizedInput, usePositionInput } from "@/hooks/useInputHooks";
import { AutoTooltip } from "@/components/common";
import { useMemo } from "react";

const INCH_TO_MM = 25.4;
const CARD_W_IN = 2.5;
const CARD_H_IN = 3.5;

function inToMm(inches: number) {
    return inches * INCH_TO_MM;
}

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

    const setCardSpacingMm = useSettingsStore((state) => state.setCardSpacingMm);
    const setCardPositionX = useSettingsStore((state) => state.setCardPositionX);
    const setCardPositionY = useSettingsStore((state) => state.setCardPositionY);

    const pageWmm = pageUnit === "mm" ? pageWidth : inToMm(pageWidth);
    const pageHmm = pageUnit === "mm" ? pageHeight : inToMm(pageHeight);

    const cardWmm = inToMm(CARD_W_IN) + (bleedEdge ? 2 * bleedEdgeWidth : 0);
    const cardHmm = inToMm(CARD_H_IN) + (bleedEdge ? 2 * bleedEdgeWidth : 0);

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

    return (
        <div className="space-y-4">
            <div>
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
        </div>
    );
}
