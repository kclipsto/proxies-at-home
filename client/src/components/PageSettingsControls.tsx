import { useSettingsStore } from "@/store";
import {
  Button,
  Checkbox,
  HR,
  Label,
  Select,
  Tooltip,
} from "flowbite-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { HelpCircle, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExportActions } from "./LayoutSettings/ExportActions";
import { PageSizeControl } from "./LayoutSettings/PageSizeControl";
import { useImageProcessing } from "@/hooks/useImageProcessing";
import { NumberInput } from "./NumberInput";

const INCH_TO_MM = 25.4;
const CARD_W_IN = 2.5;
const CARD_H_IN = 3.5;
const MAX_BROWSER_DIMENSION = 16384; // Max canvas dimension

function inToMm(inches: number) {
  return inches * INCH_TO_MM;
}

// Custom hook for normalized numeric inputs
const useNormalizedInput = (
  initialValue: number,
  onValueChange: (value: number) => void,
  options: { min?: number; max?: number; isInteger?: boolean } = {}
) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const { min, max, isInteger } = options;

  const normalizeValue = useCallback((value: string): string => {
    if (!value.trim()) return ""; // Don't return default values during typing

    // Replace comma with dot
    const normalized = value.replace(",", ".");

    // Remove leading zeros unless it's just "0" or followed by decimal separator
    if (normalized !== "0" && !normalized.startsWith("0.")) {
      return normalized.replace(/^0+(?=\d)/, "");
    }

    return normalized;
  }, []);

  const [warning, setWarning] = useState<string | null>(null);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      const normalized = normalizeValue(value);
      let finalValue = normalized;

      if (normalized.trim()) {
        let numValue = isInteger
          ? parseInt(normalized, 10)
          : parseFloat(normalized);

        if (!isNaN(numValue)) {
          // Clamp value if min/max are provided
          let clamped = false;
          if (typeof min === "number" && numValue < min) {
            numValue = min;
            clamped = true;
          }
          if (typeof max === "number" && numValue > max) {
            numValue = max;
            clamped = true;
          }

          if (clamped) {
            setWarning(`Value limited to ${min !== undefined && numValue === min ? min : max}`);
            if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
            warningTimeoutRef.current = setTimeout(() => setWarning(null), 2000);
          }

          onValueChange(numValue);

          // If the value was clamped or normalized differently, update the input
          const parsedOriginal = isInteger ? parseInt(normalized, 10) : parseFloat(normalized);
          if (numValue !== parsedOriginal) {
            finalValue = numValue.toString();
          }
        }
      }

      // Only update the input if we changed something
      if (finalValue !== value) {
        e.target.value = finalValue;
      }
    },
    [normalizeValue, onValueChange, isInteger, min, max]
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (!value.trim()) {
        // Set to the placeholder value (which is the current state value)
        const placeholder = e.target.placeholder;
        e.target.value = placeholder;
        const numValue = isInteger
          ? parseInt(placeholder, 10)
          : parseFloat(placeholder);
        onValueChange(isNaN(numValue) ? (isInteger ? 1 : 0) : numValue);
      } else {
        // Also clamp on blur just in case
        let numValue = isInteger
          ? parseInt(value, 10)
          : parseFloat(value);
        if (!isNaN(numValue)) {
          if (typeof min === "number") numValue = Math.max(min, numValue);
          if (typeof max === "number") numValue = Math.min(max, numValue);
          e.target.value = numValue.toString();
          onValueChange(numValue);
        }
      }
    },
    [onValueChange, isInteger, min, max]
  );

  // Sync input value with state when state changes externally
  useEffect(() => {
    if (inputRef.current) {
      const currentString = inputRef.current.value;
      const parsedCurrent = isInteger ? parseInt(currentString, 10) : parseFloat(currentString);
      const isFocused = document.activeElement === inputRef.current;

      if (isFocused) {
        // If focused, only update if the values are actually different numbers
        // AND the input is not in an intermediate state (like empty or ending in decimal)
        if (!isNaN(parsedCurrent) && parsedCurrent !== initialValue) {
          inputRef.current.value = initialValue.toString();
        }
      } else {
        // If not focused, always sync to the state (e.g. Reset button clicked)
        if (currentString !== initialValue.toString()) {
          inputRef.current.value = initialValue.toString();
        }
      }
    }
  }, [initialValue, isInteger]);

  // Cleanup timeout
  useEffect(() => {
    return () => {
      if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    };
  }, []);

  return {
    inputRef,
    handleChange,
    handleBlur,
    defaultValue: initialValue,
    warning,
  };
};

// Custom hook for position inputs (supports negative values)
const usePositionInput = (
  initialValue: number,
  onValueChange: (value: number) => void
) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const normalizeValue = useCallback((value: string): string => {
    if (!value.trim()) return ""; // Don't return default values during typing

    // Handle negative sign
    const isNegative = value.startsWith("-");
    const cleanValue = value.replace(/^-/, "");

    // Replace comma with dot
    const normalized = cleanValue.replace(",", ".");

    // Remove leading zeros unless it's just "0" or followed by decimal separator
    let cleaned = normalized;
    if (cleaned !== "0" && !cleaned.startsWith("0.")) {
      cleaned = cleaned.replace(/^0+(?=\d)/, "");
    }

    return isNegative ? `-${cleaned}` : cleaned;
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
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
    },
    [normalizeValue, onValueChange]
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (!value.trim()) {
        // Set to the placeholder value (which is the current state value)
        const placeholder = e.target.placeholder;
        e.target.value = placeholder;
        const numValue = parseFloat(placeholder);
        onValueChange(isNaN(numValue) ? 0 : numValue);
      }
    },
    [onValueChange]
  );

  // Sync input value with state when state changes externally
  useEffect(() => {
    if (inputRef.current) {
      const currentString = inputRef.current.value;
      const parsedCurrent = parseFloat(currentString);
      const isFocused = document.activeElement === inputRef.current;

      if (isFocused) {
        if (!isNaN(parsedCurrent) && parsedCurrent !== initialValue) {
          inputRef.current.value = initialValue.toString();
        }
      } else {
        if (currentString !== initialValue.toString()) {
          inputRef.current.value = initialValue.toString();
        }
      }
    }
  }, [initialValue]);

  return {
    inputRef,
    handleChange,
    handleBlur,
    defaultValue: initialValue.toString(),
  };
};

type PageSettingsControlsProps = {
  reprocessSelectedImages: ReturnType<
    typeof useImageProcessing
  >["reprocessSelectedImages"];
  cancelProcessing: ReturnType<typeof useImageProcessing>["cancelProcessing"];
};

export function PageSettingsControls({
  reprocessSelectedImages,
  cancelProcessing,
}: PageSettingsControlsProps) {
  const cards = useLiveQuery(() => db.cards.orderBy("order").toArray(), []) || [];

  const columns = useSettingsStore((state) => state.columns);
  const rows = useSettingsStore((state) => state.rows);
  const bleedEdgeWidth = useSettingsStore((state) => state.bleedEdgeWidth);
  const bleedEdge = useSettingsStore((state) => state.bleedEdge);
  const darkenNearBlack = useSettingsStore((state) => state.darkenNearBlack);
  const guideColor = useSettingsStore((state) => state.guideColor);
  const guideWidth = useSettingsStore((state) => state.guideWidth);
  const zoom = useSettingsStore((state) => state.zoom);
  const pageWidth = useSettingsStore((s) => s.pageWidth);
  const pageHeight = useSettingsStore((s) => s.pageHeight);
  const pageUnit = useSettingsStore((s) => s.pageSizeUnit);
  const cardSpacingMm = useSettingsStore((s) => s.cardSpacingMm);
  const cardPositionX = useSettingsStore((s) => s.cardPositionX);
  const cardPositionY = useSettingsStore((s) => s.cardPositionY);
  const dpi = useSettingsStore((s) => s.dpi);
  const cutLineStyle = useSettingsStore((s) => s.cutLineStyle);

  const setColumns = useSettingsStore((state) => state.setColumns);
  const setRows = useSettingsStore((state) => state.setRows);
  const setBleedEdgeWidth = useSettingsStore(
    (state) => state.setBleedEdgeWidth
  );
  const setBleedEdge = useSettingsStore((state) => state.setBleedEdge);
  const setDarkenNearBlack = useSettingsStore(
    (state) => state.setDarkenNearBlack
  );
  const setGuideColor = useSettingsStore((state) => state.setGuideColor);
  const setGuideWidth = useSettingsStore((state) => state.setGuideWidth);
  const setZoom = useSettingsStore((state) => state.setZoom);
  const resetSettings = useSettingsStore((state) => state.resetSettings);
  const setCardSpacingMm = useSettingsStore((s) => s.setCardSpacingMm);
  const setCardPositionX = useSettingsStore((s) => s.setCardPositionX);
  const setCardPositionY = useSettingsStore((s) => s.setCardPositionY);
  const setDpi = useSettingsStore((s) => s.setDpi);
  const setCutLineStyle = useSettingsStore((s) => s.setCutLineStyle);



  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);

  const handleReset = () => {
    setShowResetConfirmModal(true);
  };

  const confirmReset = async () => {
    setShowResetConfirmModal(false);
    try {
      // Delete the entire database to ensure a full reset
      await db.delete();

      // Re-open the database (Dexie handles this automatically on next access, 
      // but explicit open is good practice if we were staying on the page, 
      // though we reload below anyway)
      await db.open();

      resetSettings(); // Reset settings store to defaults

      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(
          names
            .filter((n) => n.startsWith("proxxied-"))
            .map((n) => caches.delete(n))
        );
      }
    } catch (e) {
      console.error("Error clearing app data:", e);
    } finally {
      window.location.reload();
    }
  };

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

  const cardsRef = useRef(cards);
  cardsRef.current = cards;

  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedReprocess = useCallback(
    (newBleedWidth: number, darkenNearBlack: boolean) => {
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = setTimeout(() => {
        reprocessSelectedImages(cardsRef.current, newBleedWidth, darkenNearBlack);
      }, 500);
    },
    [reprocessSelectedImages]
  );

  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    };
  }, []);

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
  const columnsInput = useNormalizedInput(
    columns,
    (value) => setColumns(value),
    { min: 1, max: 10, isInteger: true }
  );

  const rowsInput = useNormalizedInput(
    rows,
    (value) => setRows(value),
    { min: 1, max: 10, isInteger: true }
  );

  const bleedEdgeInput = useNormalizedInput(
    bleedEdgeWidth,
    (value) => {
      setBleedEdgeWidth(value);
      debouncedReprocess(value, darkenNearBlack);
    },
    { min: 0, max: 2 }
  );

  const cardSpacingInput = useNormalizedInput(
    cardSpacingMm,
    (value) => setCardSpacingMm(value),
    { min: 0, max: maxSpacingMm }
  );

  const cardPositionXInput = usePositionInput(cardPositionX, setCardPositionX);
  const cardPositionYInput = usePositionInput(cardPositionY, setCardPositionY);

  const guideWidthInput = useNormalizedInput(guideWidth, setGuideWidth, { min: 0 });

  return (
    <div className="w-1/5 min-w-[18rem] max-w-[26rem] p-4 bg-gray-100 dark:bg-gray-700 h-full flex flex-col gap-4 overflow-y-auto">
      <h2 className="text-2xl font-semibold dark:text-white">Settings</h2>

      <div className="space-y-4">
        <PageSizeControl />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="columns-input">Columns</Label>
            <NumberInput
              id="columns-input"
              ref={columnsInput.inputRef}
              className="w-full"
              min={1}
              max={10}
              defaultValue={columnsInput.defaultValue}
              onChange={columnsInput.handleChange}
              onBlur={columnsInput.handleBlur}
              placeholder={columns.toString()}
            />
          </div>
          <div>
            <Label htmlFor="rows-input">Rows</Label>
            <NumberInput
              id="rows-input"
              ref={rowsInput.inputRef}
              className="w-full"
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
          <div className="flex justify-between items-center mb-2">
            <Label>Bleed Edge (mm)</Label>
            {bleedEdgeInput.warning && (
              <span className="text-xs text-red-500 animate-pulse">
                {bleedEdgeInput.warning}
              </span>
            )}
          </div>
          <NumberInput
            ref={bleedEdgeInput.inputRef}
            className="w-full"
            step={0.1}
            defaultValue={bleedEdgeInput.defaultValue}
            onChange={bleedEdgeInput.handleChange}
            onBlur={bleedEdgeInput.handleBlur}
            placeholder={bleedEdgeWidth.toString()}
            disabled={!bleedEdge}
          />
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="bleed-edge"
            checked={bleedEdge}
            onChange={(e) => {
              setBleedEdge(e.target.checked);
              if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
              if (!e.target.checked) {
                cancelProcessing();
              }
              reprocessSelectedImages(
                cards,
                e.target.checked ? bleedEdgeWidth : 0,
                darkenNearBlack
              );
            }}
          />
          <Label htmlFor="bleed-edge">Enable Bleed Edge</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="darken-near-black"
            checked={darkenNearBlack}
            onChange={(e) => {
              setDarkenNearBlack(e.target.checked);
              reprocessSelectedImages(cards, bleedEdge ? bleedEdgeWidth : 0, e.target.checked);
            }}
          />
          <Label htmlFor="darken-near-black">Darken Near-Black Pixels</Label>
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

        {/* Card positioning controls */}
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
          <Label>Guides Color</Label>
          <input
            type="color"
            value={guideColor}
            onChange={(e) => setGuideColor(e.target.value)}
            className="color-input w-full h-10 p-0 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 cursor-pointer"
          />
        </div>

        <div>
          <Label>Guides Width (px)</Label>
          <NumberInput
            ref={guideWidthInput.inputRef}
            className="w-full"
            step={0.1}
            min={0}
            defaultValue={guideWidthInput.defaultValue}
            onChange={guideWidthInput.handleChange}
            onBlur={guideWidthInput.handleBlur}
            placeholder={guideWidth.toString()}
          />
        </div>

        <div>
          <Label>Cut Line Style</Label>
          <Select
            value={cutLineStyle}
            onChange={(e) => setCutLineStyle(e.target.value as "none" | "edges" | "full")}
          >
            <option value="none">None</option>
            <option value="edges">Edges Only</option>
            <option value="full">Full Lines</option>
          </Select>
        </div>

        <div>
          <Label>Zoom</Label>
          <div className="flex flex-col gap-2">
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
            <div className="relative w-full h-6 flex items-center">
              {/* Center Tick Mark (1x) */}
              <div className="absolute left-1/2 -translate-x-1/2 w-1 h-8 bg-gray-300 dark:bg-gray-600 rounded pointer-events-none" />

              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={(() => {
                  if (zoom <= 1.0) return ((zoom - 0.1) / 0.9) * 50;
                  return 50 + ((zoom - 1.0) / 4.0) * 50;
                })()}
                onDoubleClick={() => setZoom(1.0)}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);

                  // Helper to convert slider value to zoom
                  const toZoom = (v: number) => {
                    if (v <= 50) return 0.1 + (v / 50) * 0.9;
                    return 1.0 + ((v - 50) / 50) * 4.0;
                  };

                  // Helper to convert zoom to slider value
                  const toSlider = (z: number) => {
                    if (z <= 1.0) return ((z - 0.1) / 0.9) * 50;
                    return 50 + ((z - 1.0) / 4.0) * 50;
                  };

                  // Define snap points
                  // 0.1 to 0.9 in 0.1 steps
                  // 1.0 to 5.0 in 0.5 steps
                  const snapZooms: number[] = [];
                  for (let z = 0.1; z < 1.0; z += 0.1) snapZooms.push(z);
                  for (let z = 1.0; z <= 5.0; z += 0.5) snapZooms.push(z);

                  let newZoom = toZoom(val);

                  // Check for snapping
                  for (const snapZoom of snapZooms) {
                    const snapSliderVal = toSlider(snapZoom);
                    if (Math.abs(val - snapSliderVal) < 3) { // Snap threshold of 3 units
                      newZoom = snapZoom;
                      break;
                    }
                  }

                  setZoom(newZoom);
                }}
                className="zoom-slider w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer dark:bg-gray-600 accent-blue-600 relative z-10"
              />
            </div>
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
          onClick={handleReset}
        >
          Reset App Data
        </span>
      </div>

      {showResetConfirmModal && (
        <div className="fixed inset-0 z-50 bg-gray-900/50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 p-6 rounded shadow-md w-96 text-center">
            <div className="mb-4 text-lg font-semibold text-gray-800 dark:text-white">
              Confirm Reset App Data
            </div>
            <div className="mb-5 text-lg font-normal text-gray-500 dark:text-gray-400">
              This will clear all saved Proxxied data (cards, cached images,
              settings) and reload the page. Continue?
            </div>
            <div className="flex justify-center gap-4">
              <Button
                color="failure"
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={confirmReset}
              >
                Yes, I'm sure
              </Button>
              <Button
                color="gray"
                onClick={() => setShowResetConfirmModal(false)}
              >
                No, cancel
              </Button>
            </div>
          </div>
        </div>
      )}

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
