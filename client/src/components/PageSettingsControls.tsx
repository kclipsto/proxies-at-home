import { useImageProcessing } from "@/hooks/useImageProcessing";
import { useCardsStore, useSettingsStore } from "@/store";
import { Button, Checkbox, HelperText, HR, Label, TextInput } from "flowbite-react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { ExportActions } from "./LayoutSettings/ExportActions";
import { PageSizeControl } from "./LayoutSettings/PageSizeControl";

const INCH_TO_MM = 25.4;
const CARD_W_IN = 2.5;
const CARD_H_IN = 3.5;

function inToMm(inches: number) {
  return inches * INCH_TO_MM;
}

export function PageSettingsControls() {
  const cards = useCardsStore((state) => state.cards);

  const columns = useSettingsStore((state) => state.columns);
  const rows = useSettingsStore((state) => state.rows);

  const bleedEdgeWidth = useSettingsStore((state) => state.bleedEdgeWidth);
  const bleedEdge = useSettingsStore((state) => state.bleedEdge);

  const guideColor = useSettingsStore((state) => state.guideColor);
  const guideWidth = useSettingsStore((state) => state.guideWidth);
  const zoom = useSettingsStore((state) => state.zoom);

  const pageWidth = useSettingsStore((s) => s.pageWidth);
  const pageHeight = useSettingsStore((s) => s.pageHeight);
  const pageUnit = useSettingsStore((s) => s.pageSizeUnit);

  const cardSpacingMm = useSettingsStore((s) => s.cardSpacingMm);
  const horizontalSpacingMm = useSettingsStore((s) => s.horizontalSpacingMm);
  const verticalSpacingMm = useSettingsStore((s) => s.verticalSpacingMm);
  const symmetricSpacing = useSettingsStore((s) => s.symmetricSpacing);

  const setColumns = useSettingsStore((state) => state.setColumns);
  const setRows = useSettingsStore((state) => state.setRows);
  const setBleedEdgeWidth = useSettingsStore((state) => state.setBleedEdgeWidth);
  const setBleedEdge = useSettingsStore((state) => state.setBleedEdge);
  const setGuideColor = useSettingsStore((state) => state.setGuideColor);
  const setGuideWidth = useSettingsStore((state) => state.setGuideWidth);
  const setZoom = useSettingsStore((state) => state.setZoom);
  const resetSettings = useSettingsStore((state) => state.resetSettings);
  const setCardSpacingMm = useSettingsStore((s) => s.setCardSpacingMm);
  const setHorizontalSpacingMm = useSettingsStore((s) => s.setHorizontalSpacingMm);
  const setVerticalSpacingMm = useSettingsStore((s) => s.setVerticalSpacingMm);
  const setSymmetricSpacing = useSettingsStore((s) => s.setSymmetricSpacing);

  const { reprocessSelectedImages } = useImageProcessing({
    unit: "mm",
    bleedEdgeWidth,
  });

  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedReprocess = useCallback(
    (cards: any[], newBleedWidth: number) => {
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = setTimeout(() => {
        reprocessSelectedImages(cards, newBleedWidth);
      }, 500);
    },
    [reprocessSelectedImages]
  );

  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    };
  }, []);

  // Handle syncing spacing values when switching between symmetric and asymmetric modes
  useEffect(() => {
    if (symmetricSpacing) {
      // When switching to symmetric, use the average of horizontal and vertical
      const avgSpacing = Math.round((horizontalSpacingMm + verticalSpacingMm) / 2);
      setCardSpacingMm(avgSpacing);
    } else {
      // When switching to asymmetric, set both to the current symmetric value
      setHorizontalSpacingMm(cardSpacingMm);
      setVerticalSpacingMm(cardSpacingMm);
    }
  }, [symmetricSpacing]);

  // ----- Spacing math (work in mm for a single formula) -----
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

  const handleSpacingChange = (val: string) => {
    const mm = Math.max(0, Number(val) || 0);
    setCardSpacingMm(Math.min(mm, maxSpacingMm));
  };

  return (
    <div className="w-1/4 min-w-[18rem] max-w-[26rem] p-4 bg-gray-100 dark:bg-gray-700 h-full flex flex-col gap-4 overflow-y-auto">
      <h2 className="text-2xl font-semibold dark:text-white">Settings</h2>

      <div className="space-y-4">
        <PageSizeControl />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Columns</Label>
            <TextInput
              className="w-full"
              type="number"
              min={1}
              max={10}
              value={columns}
              onChange={(e) => {
                const v = Math.max(1, Math.min(10, parseInt(e.target.value || "1", 10)));
                if (!Number.isNaN(v)) setColumns(v);
              }}
            />
          </div>
          <div>
            <Label>Rows</Label>
            <TextInput
              className="w-full"
              type="number"
              min={1}
              max={10}
              value={rows}
              onChange={(e) => {
                const v = Math.max(1, Math.min(10, parseInt(e.target.value || "1", 10)));
                if (!Number.isNaN(v)) setRows(v);
              }}
            />
          </div>
        </div>

        <div>
          <Label>Bleed Edge (mm)</Label>
          <TextInput
            className="w-full"
            type="number"
            value={bleedEdgeWidth}
            max={2}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              if (!isNaN(val)) {
                setBleedEdgeWidth(val);
                // Only bleed width affects reprocessing
                debouncedReprocess(cards, val);
              }
            }}
          />
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="bleed-edge"
            checked={bleedEdge}
            onChange={(e) => setBleedEdge(e.target.checked)}
          />
          <Label htmlFor="bleed-edge">Enable Bleed Edge</Label>
        </div>

        {/* Card-to-card spacing */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Checkbox
              id="symmetric-spacing"
              checked={symmetricSpacing}
              onChange={(e) => setSymmetricSpacing(e.target.checked)}
            />
            <Label htmlFor="symmetric-spacing">Use symmetric spacing</Label>
          </div>
          
          {symmetricSpacing ? (
            <>
              <Label>Distance between cards (mm)</Label>
              <TextInput
                className="w-full"
                type="number"
                min={0}
                step={0.5}
                value={cardSpacingMm}
                onChange={(e) => handleSpacingChange(e.target.value)}
              />
            </>
          ) : (
            <div className="space-y-2">
              <div>
                <Label>Horizontal spacing (mm)</Label>
                <TextInput
                  className="w-full"
                  type="number"
                  min={0}
                  step={0.5}
                  value={horizontalSpacingMm}
                  onChange={(e) => {
                    const mm = Math.max(0, Number(e.target.value) || 0);
                    setHorizontalSpacingMm(Math.min(mm, maxSpacingMm));
                  }}
                />
              </div>
              <div>
                <Label>Vertical spacing (mm)</Label>
                <TextInput
                  className="w-full"
                  type="number"
                  min={0}
                  step={0.5}
                  value={verticalSpacingMm}
                  onChange={(e) => {
                    const mm = Math.max(0, Number(e.target.value) || 0);
                    setVerticalSpacingMm(Math.min(mm, maxSpacingMm));
                  }}
                />
              </div>
            </div>
          )}
          <HelperText>
            Max that fits with current layout: <b>{maxSpacingMm} mm</b>.
          </HelperText>
        </div>

        <div>
          <Label>Guides Color</Label>
          <input
            type="color"
            value={guideColor}
            onChange={(e) => setGuideColor(e.target.value)}
            className="w-full h-10 p-0 border rounded"
          />
        </div>

        <div>
          <Label>Guides Width (px)</Label>
          <TextInput
            className="w-full"
            type="number"
            value={guideWidth}
            step="0.1"
            min="0"
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val)) setGuideWidth(val);
            }}
          />
        </div>

        <div>
          <Label>Zoom</Label>
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
        </div>

        <HR className="dark:bg-gray-500" />

        <ExportActions />
      </div>

      <div className="w-full flex justify-center">
        <span
          className="text-gray-400 hover:underline cursor-pointer text-sm font-medium"
          onClick={resetSettings}
        >
          Reset Settings
        </span>
      </div>

      <div className="w-full flex justify-center">
        <span
          className="text-red-600 hover:underline cursor-pointer text-sm font-medium"
          onClick={async () => {
            const ok = window.confirm(
              "This will clear all saved Proxxied data (cards, cached images, settings) and reload the page. Continue?"
            );
            if (!ok) return;

            try {
              const toRemove: string[] = [];
              for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith("proxxied:")) toRemove.push(k);
              }
              toRemove.forEach((k) => localStorage.removeItem(k));

              if ("caches" in window) {
                const names = await caches.keys();
                await Promise.all(
                  names.filter((n) => n.startsWith("proxxied-")).map((n) => caches.delete(n))
                );
              }
            } catch {
            } finally {
              window.location.reload();
            }
          }}
        >
          Reset App Data
        </span>
      </div>

      <div className="mt-auto space-y-3 pt-4">
        <a
          href="https://github.com/kclipsto/proxies-at-home"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-md underline text-center text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
        >
          Code by Kaiser Clipston (Github)
        </a>
      </div>
    </div>
  );
}
