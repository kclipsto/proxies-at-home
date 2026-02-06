import { useSettingsStore } from "@/store/settings";
import { Label, Select, Button } from "flowbite-react";
import { ExportActions } from "../../LayoutSettings/ExportActions";
import { ToggleButtonGroup, AutoTooltip } from "../../common";
import { useMemo, useEffect, useCallback } from "react";
import type { CardOption } from "@/types";
import { settingsToCuttingTemplate, downloadCuttingTemplate } from "@/helpers/exportCuttingTemplate";

const INCH_TO_MM = 25.4;
const MAX_BROWSER_DIMENSION = 16384;

const DECKLIST_ORDER_OPTIONS = [
    { id: 'displayed' as const, label: 'As Displayed' },
    { id: 'alpha' as const, label: 'Alphabetical' },
];

type Props = {
    cards: CardOption[];
};

export function ExportSection({ cards }: Props) {
    const pageWidth = useSettingsStore((state) => state.pageWidth);
    const pageHeight = useSettingsStore((state) => state.pageHeight);
    const pageUnit = useSettingsStore((state) => state.pageSizeUnit);
    const dpi = useSettingsStore((state) => state.dpi);
    const setDpi = useSettingsStore((state) => state.setDpi);
    const decklistSortAlpha = useSettingsStore((state) => state.decklistSortAlpha);
    const setDecklistSortAlpha = useSettingsStore((state) => state.setDecklistSortAlpha);

    // Settings for cutting template export
    const columns = useSettingsStore((state) => state.columns);
    const rows = useSettingsStore((state) => state.rows);
    const bleedEdge = useSettingsStore((state) => state.bleedEdge);
    const bleedEdgeWidth = useSettingsStore((state) => state.bleedEdgeWidth);
    const bleedEdgeUnit = useSettingsStore((state) => state.bleedEdgeUnit);
    const cardSpacingMm = useSettingsStore((state) => state.cardSpacingMm);
    const cardPositionX = useSettingsStore((state) => state.cardPositionX);
    const cardPositionY = useSettingsStore((state) => state.cardPositionY);
    const registrationMarksPortrait = useSettingsStore((state) => state.registrationMarksPortrait);

    const handleExportCuttingTemplate = useCallback(() => {
        const settings = settingsToCuttingTemplate(
            pageWidth,
            pageHeight,
            pageUnit,
            columns,
            rows,
            bleedEdge,
            bleedEdgeWidth,
            bleedEdgeUnit,
            cardSpacingMm,
            cardPositionX,
            cardPositionY,
            registrationMarksPortrait
        );
        downloadCuttingTemplate(settings);
    }, [
        pageWidth, pageHeight, pageUnit, columns, rows,
        bleedEdge, bleedEdgeWidth, bleedEdgeUnit,
        cardSpacingMm, cardPositionX, cardPositionY, registrationMarksPortrait
    ]);

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

    // If current DPI exceeds max, clamp it down
    useEffect(() => {
        if (dpi > maxSafeDpiForPage) {
            const highestOption = availableDpiOptions.at(-1);
            if (highestOption) {
                setDpi(highestOption.value);
            }
        }
    }, [availableDpiOptions, dpi, maxSafeDpiForPage, setDpi]);

    return (
        <div className="space-y-4">
            <ExportActions cards={cards} />
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

            <div>
                <div className="mb-2 block">
                    <Label>Copy Decklist Order</Label>
                </div>
                <ToggleButtonGroup
                    options={DECKLIST_ORDER_OPTIONS}
                    value={decklistSortAlpha ? 'alpha' : 'displayed'}
                    onChange={(val) => setDecklistSortAlpha(val === 'alpha')}
                />
            </div>

            <div className="flex items-center gap-2">
                <Button
                    color="gray"
                    onClick={handleExportCuttingTemplate}
                    className="flex-1"
                >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Cutting Template (SVG)
                </Button>
                <AutoTooltip content="Export an SVG cutting template based on your current layout settings. Import this into Silhouette Studio for print & cut alignment." />
            </div>
        </div>
    );
}