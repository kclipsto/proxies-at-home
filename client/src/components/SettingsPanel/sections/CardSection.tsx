import { useSettingsStore } from "@/store/settings";
import { Label, Select, Tooltip } from "flowbite-react";
import { NumberInput } from "../../NumberInput";
import { useNormalizedInput, usePositionInput } from "@/hooks/useInputHooks";
import { HelpCircle } from "lucide-react";
import { useMemo, useEffect } from "react";

const INCH_TO_MM = 25.4;
const CARD_W_IN = 2.5;
const CARD_H_IN = 3.5;
const MAX_BROWSER_DIMENSION = 16384;

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
    const dpi = useSettingsStore((state) => state.dpi);

    const setCardSpacingMm = useSettingsStore((state) => state.setCardSpacingMm);
    const setCardPositionX = useSettingsStore((state) => state.setCardPositionX);
    const setCardPositionY = useSettingsStore((state) => state.setCardPositionY);
    const setDpi = useSettingsStore((state) => state.setDpi);

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

    const maxSafeDpiForPage = useMemo(() => {
        const widthIn = pageUnit === "in" ? pageWidth : pageWidth / INCH_TO_MM;
        const heightIn = pageUnit === "in" ? pageHeight : pageHeight / INCH_TO_MM;
        return Math.floor(
            Math.min(
                MAX_BROWSER_DIMENSION / widthIn,
                MAX_BROWSER_DIMENSION / heightIn
            )
        );
    }, [pageWidth, pageHeight, pageUnit]);

    const availableDpiOptions = useMemo(() => {
        const options: { label: string; value: number }[] = [];
        for (let i = 300; i <= maxSafeDpiForPage; i += 300) {
            options.push({ label: `${i}`, value: i });
        }

        if (maxSafeDpiForPage % 300 !== 0) {
            options.push({
                label: `${maxSafeDpiForPage} (Max)`,
                value: maxSafeDpiForPage,
            });
        }

        options.forEach((opt) => {
            if (opt.value === 300) opt.label = "300 (Fastest)";
            else if (opt.value === 600) opt.label = "600 (Fast)";
            else if (opt.value === 900) opt.label = "900 (Sharp)";
            else if (opt.value === 1200) opt.label = "1200 (High Quality)";
            else if (opt.value === maxSafeDpiForPage)
                opt.label = `${maxSafeDpiForPage} (Max)`;
            else opt.label = `${opt.value}`;
        });

        return options;
    }, [maxSafeDpiForPage]);

    useEffect(() => {
        if (!availableDpiOptions.some((opt) => opt.value === dpi)) {
            const highestOption = availableDpiOptions[availableDpiOptions.length - 1];
            if (highestOption) {
                setDpi(highestOption.value);
            }
        }
    }, [availableDpiOptions, dpi, setDpi]);

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
                    <Tooltip
                        content={
                            <div className="whitespace-nowrap">
                                Max that fits with current layout: {maxSpacingMm} mm
                            </div>
                        }
                    >
                        <HelpCircle className="w-4 h-4 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 cursor-pointer" />
                    </Tooltip>
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
                    <Tooltip content="Adjust card position for perfect printer alignment. Use small values (0.1-2.0mm) for fine-tuning.">
                        <HelpCircle className="w-4 h-4 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 cursor-pointer" />
                    </Tooltip>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <div className="flex items-center justify-between">
                            <Label>Horizontal Offset</Label>
                            <Tooltip content="Positive = right, negative = left">
                                <HelpCircle className="w-4 h-4 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 cursor-pointer" />
                            </Tooltip>
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
                            <Tooltip content="Positive = down, negative = up">
                                <HelpCircle className="w-4 h-4 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 cursor-pointer" />
                            </Tooltip>
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

            <div>
                <Label>PDF Export DPI</Label>
                <Select
                    value={dpi}
                    onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) setDpi(val);
                    }}
                >
                    {availableDpiOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </Select>
            </div>
        </div>
    );
}
