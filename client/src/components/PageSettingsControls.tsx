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

// Custom hook for normalized numeric inputs
const useNormalizedInput = (initialValue: number, onValueChange: (value: number) => void, isInteger = false) => {
  const inputRef = useRef<HTMLInputElement>(null);
  
  const normalizeValue = useCallback((value: string): string => {
    if (!value.trim()) return ''; // Don't return default values during typing
    
    // Replace comma with dot
    const normalized = value.replace(',', '.');
    
    // Remove leading zeros unless it's just "0" or followed by decimal separator
    if (normalized !== '0' && !normalized.startsWith('0.')) {
      return normalized.replace(/^0+(?=\d)/, '');
    }
    
    return normalized;
  }, []);
  
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const normalized = normalizeValue(value);
    
    // Only update the input if normalization changed the value
    if (normalized !== value) {
      e.target.value = normalized;
    }
    
    // Only update state if there's a valid value
    if (normalized.trim()) {
      const numValue = isInteger ? parseInt(normalized, 10) : parseFloat(normalized);
      if (!isNaN(numValue)) {
        onValueChange(numValue);
      }
    }
  }, [normalizeValue, onValueChange, isInteger]);
  
  const handleBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (!value.trim()) {
      // Set to the placeholder value (which is the current state value)
      const placeholder = e.target.placeholder;
      e.target.value = placeholder;
      const numValue = isInteger ? parseInt(placeholder, 10) : parseFloat(placeholder);
      onValueChange(isNaN(numValue) ? (isInteger ? 1 : 0) : numValue);
    }
  }, [onValueChange, isInteger]);
  
  return {
    inputRef,
    handleChange,
    handleBlur,
    defaultValue: initialValue.toString()
  };
};

// Custom hook for position inputs (supports negative values)
const usePositionInput = (initialValue: number, onValueChange: (value: number) => void) => {
  const inputRef = useRef<HTMLInputElement>(null);
  
  const normalizeValue = useCallback((value: string): string => {
    if (!value.trim()) return ''; // Don't return default values during typing
    
    // Handle negative sign
    const isNegative = value.startsWith('-');
    const cleanValue = value.replace(/^-/, '');
    
    // Replace comma with dot
    const normalized = cleanValue.replace(',', '.');
    
    // Remove leading zeros unless it's just "0" or followed by decimal separator
    let cleaned = normalized;
    if (cleaned !== '0' && !cleaned.startsWith('0.')) {
      cleaned = cleaned.replace(/^0+(?=\d)/, '');
    }
    
    return isNegative ? `-${cleaned}` : cleaned;
  }, []);
  
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const normalized = normalizeValue(value);
    
    // Only update the input if normalization changed the value
    if (normalized !== value) {
      e.target.value = normalized;
    }
    
    // Only update state if there's a valid value
    if (normalized.trim()) {
      const numValue = parseFloat(normalized);
      if (!isNaN(numValue)) {
        onValueChange(numValue);
      }
    }
  }, [normalizeValue, onValueChange]);
  
  const handleBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (!value.trim()) {
      // Set to the placeholder value (which is the current state value)
      const placeholder = e.target.placeholder;
      e.target.value = placeholder;
      const numValue = parseFloat(placeholder);
      onValueChange(isNaN(numValue) ? 0 : numValue);
    }
  }, [onValueChange]);
  
  return {
    inputRef,
    handleChange,
    handleBlur,
    defaultValue: initialValue.toString()
  };
};

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
  const cardPositionX = useSettingsStore((s) => s.cardPositionX);
  const cardPositionY = useSettingsStore((s) => s.cardPositionY);

  const setColumns = useSettingsStore((state) => state.setColumns);
  const setRows = useSettingsStore((state) => state.setRows);
  const setBleedEdgeWidth = useSettingsStore((state) => state.setBleedEdgeWidth);
  const setBleedEdge = useSettingsStore((state) => state.setBleedEdge);
  const setGuideColor = useSettingsStore((state) => state.setGuideColor);
  const setGuideWidth = useSettingsStore((state) => state.setGuideWidth);
  const setZoom = useSettingsStore((state) => state.setZoom);
  const resetSettings = useSettingsStore((state) => state.resetSettings);
  const setCardSpacingMm = useSettingsStore((s) => s.setCardSpacingMm);
  const setCardPositionX = useSettingsStore((s) => s.setCardPositionX);
  const setCardPositionY = useSettingsStore((s) => s.setCardPositionY);

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

  // Input handlers using custom hooks
  const columnsInput = useNormalizedInput(columns, (value) => {
    const v = Math.max(1, Math.min(10, value));
    setColumns(v);
  }, true);

  const rowsInput = useNormalizedInput(rows, (value) => {
    const v = Math.max(1, Math.min(10, value));
    setRows(v);
  }, true);

  const bleedEdgeInput = useNormalizedInput(bleedEdgeWidth, (value) => {
    setBleedEdgeWidth(value);
    debouncedReprocess(cards, value);
  });

  const cardSpacingInput = useNormalizedInput(cardSpacingMm, (value) => {
    const mm = Math.max(0, Math.min(value, maxSpacingMm));
    setCardSpacingMm(mm);
  });

  const cardPositionXInput = usePositionInput(cardPositionX, setCardPositionX);
  const cardPositionYInput = usePositionInput(cardPositionY, setCardPositionY);

  const guideWidthInput = useNormalizedInput(guideWidth, setGuideWidth);

  return (
    <div className="w-1/4 min-w-[18rem] max-w-[26rem] p-4 bg-gray-100 dark:bg-gray-700 h-full flex flex-col gap-4 overflow-y-auto">
      <h2 className="text-2xl font-semibold dark:text-white">Settings</h2>

      <div className="space-y-4">
        <PageSizeControl />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Columns</Label>
            <TextInput
              ref={columnsInput.inputRef}
              className="w-full"
              type="number"
              min={1}
              max={10}
              defaultValue={columnsInput.defaultValue}
              onChange={columnsInput.handleChange}
              onBlur={columnsInput.handleBlur}
              placeholder={columns.toString()}
            />
          </div>
          <div>
            <Label>Rows</Label>
            <TextInput
              ref={rowsInput.inputRef}
              className="w-full"
              type="number"
              min={1}
              max={10}
              defaultValue={rowsInput.defaultValue}
              onChange={rowsInput.handleChange}
              onBlur={rowsInput.handleBlur}
              placeholder={rows.toString()}
            />
          </div>
        </div>

        <div>
          <Label>Bleed Edge (mm)</Label>
          <TextInput
            ref={bleedEdgeInput.inputRef}
            className="w-full"
            type="number"
            max={2}
            step={0.1}
            defaultValue={bleedEdgeInput.defaultValue}
            onChange={bleedEdgeInput.handleChange}
            onBlur={bleedEdgeInput.handleBlur}
            placeholder={bleedEdgeWidth.toString()}
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

        {/* NEW: Card-to-card spacing */}
        <div>
          <Label>Distance between cards (mm)</Label>
          <TextInput
            ref={cardSpacingInput.inputRef}
            className="w-full"
            type="number"
            min={0}
            step={0.5}
            defaultValue={cardSpacingInput.defaultValue}
            onChange={cardSpacingInput.handleChange}
            onBlur={cardSpacingInput.handleBlur}
            placeholder={cardSpacingMm.toString()}
          />
          <HelperText>
            Max that fits with current layout: <b>{maxSpacingMm} mm</b>.
          </HelperText>
        </div>

        {/* Card positioning controls */}
        <div className="space-y-3">
          <Label>Card Position Adjustment (mm)</Label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Horizontal Offset</Label>
              <TextInput
                ref={cardPositionXInput.inputRef}
                className="w-full"
                type="number"
                step={0.1}
                defaultValue={cardPositionXInput.defaultValue}
                onChange={cardPositionXInput.handleChange}
                onBlur={cardPositionXInput.handleBlur}
                placeholder="-0.0"
              />
              <HelperText>Positive = right, negative = left</HelperText>
            </div>
            <div>
              <Label>Vertical Offset</Label>
              <TextInput
                ref={cardPositionYInput.inputRef}
                className="w-full"
                type="number"
                step={0.1}
                defaultValue={cardPositionYInput.defaultValue}
                onChange={cardPositionYInput.handleChange}
                onBlur={cardPositionYInput.handleBlur}
                placeholder="-0.0"
              />
              <HelperText>Positive = down, negative = up</HelperText>
            </div>
          </div>
          <HelperText>
            Adjust card position for perfect printer alignment. Use small values (0.1-2.0mm) for fine-tuning.
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
            ref={guideWidthInput.inputRef}
            className="w-full"
            type="number"
            step="0.1"
            min="0"
            defaultValue={guideWidthInput.defaultValue}
            onChange={guideWidthInput.handleChange}
            onBlur={guideWidthInput.handleBlur}
            placeholder={guideWidth.toString()}
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