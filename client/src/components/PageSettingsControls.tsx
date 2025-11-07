import { useCardsStore, useSettingsStore } from "@/store";
import {
  Button,
  Checkbox,
  HR,
  Label,
  Select,
  TextInput,
  Tooltip,
} from "flowbite-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { HelpCircle, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExportActions } from "./LayoutSettings/ExportActions";
import { PageSizeControl } from "./LayoutSettings/PageSizeControl";
import { useImageProcessing } from "@/hooks/useImageProcessing";

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
  isInteger = false
) => {
  const inputRef = useRef<HTMLInputElement>(null);

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
        const numValue = isInteger
          ? parseInt(normalized, 10)
          : parseFloat(normalized);
        if (!isNaN(numValue)) {
          onValueChange(numValue);
        }
      }
    },
    [normalizeValue, onValueChange, isInteger]
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
      }
    },
    [onValueChange, isInteger]
  );

  return {
    inputRef,
    handleChange,
    handleBlur,
    defaultValue: initialValue.toString(),
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
};

export function PageSettingsControls({
  reprocessSelectedImages,
}: PageSettingsControlsProps) {
  const cards = useLiveQuery(() => db.cards.orderBy("order").toArray(), []) || [];

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
  const dpi = useSettingsStore((s) => s.dpi);

  const setColumns = useSettingsStore((state) => state.setColumns);
  const setRows = useSettingsStore((state) => state.setRows);
  const setBleedEdgeWidth = useSettingsStore(
    (state) => state.setBleedEdgeWidth
  );
  const setBleedEdge = useSettingsStore((state) => state.setBleedEdge);
  const setGuideColor = useSettingsStore((state) => state.setGuideColor);
  const setGuideWidth = useSettingsStore((state) => state.setGuideWidth);
  const setZoom = useSettingsStore((state) => state.setZoom);
  const resetSettings = useSettingsStore((state) => state.resetSettings);
  const setCardSpacingMm = useSettingsStore((s) => s.setCardSpacingMm);
  const setCardPositionX = useSettingsStore((s) => s.setCardPositionX);
  const setCardPositionY = useSettingsStore((s) => s.setCardPositionY);
  const setDpi = useSettingsStore((s) => s.setDpi);

  const clearAllCardsAndImages = useCardsStore(
    (state) => state.clearAllCardsAndImages
  );

  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);

  const handleReset = () => {
    setShowResetConfirmModal(true);
  };

  const confirmReset = async () => {
    setShowResetConfirmModal(false);
    try {
      // Clear all data from IndexedDB
      await clearAllCardsAndImages();
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
    (newBleedWidth: number) => {
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = setTimeout(() => {
        reprocessSelectedImages(cardsRef.current, newBleedWidth);
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
    (value) => {
      const v = Math.max(1, Math.min(10, value));
      setColumns(v);
    },
    true
  );

  const rowsInput = useNormalizedInput(
    rows,
    (value) => {
      const v = Math.max(1, Math.min(10, value));
      setRows(v);
    },
    true
  );

  const bleedEdgeInput = useNormalizedInput(bleedEdgeWidth, (value) => {
    setBleedEdgeWidth(value);
    debouncedReprocess(value);
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
              key={columns}
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
              key={rows}
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
            key={bleedEdgeWidth}
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
          <div className="flex items-center justify-between">
            <Label>Distance between cards (mm)</Label>
            <Tooltip content={`Max that fits with current layout: ${maxSpacingMm} mm`}>
              <HelpCircle className="w-4 h-4 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 cursor-pointer" />
            </Tooltip>
          </div>
          <TextInput
            key={cardSpacingMm}
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
              <TextInput
                key={cardPositionX}
                ref={cardPositionXInput.inputRef}
                className="w-full"
                type="number"
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
              <TextInput
                key={cardPositionY}
                ref={cardPositionYInput.inputRef}
                className="w-full"
                type="number"
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
            className="w-full h-10 p-0 border rounded"
          />
        </div>

        <div>
          <Label>Guides Width (px)</Label>
          <TextInput
            key={guideWidth}
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
