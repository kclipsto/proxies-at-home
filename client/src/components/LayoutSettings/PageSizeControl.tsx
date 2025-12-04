import { useSettingsStore } from "@/store";
import type { LayoutPreset, PageOrientation } from "@/store/settings";
import { Button, Label, Select, ToggleSwitch } from "flowbite-react";
import { RefreshCw } from "lucide-react";
import { NumberInput } from "../NumberInput";
import { useEffect, useState } from "react";

type PresetOption = {
  name: LayoutPreset;
  width: number;
  height: number;
  unit: "in" | "mm";
};

const layoutPresets: PresetOption[] = [
  { name: "Letter", width: 8.5, height: 11, unit: "in" },
  { name: "Legal", width: 14, height: 8.5, unit: "in" },
  { name: "Tabloid", width: 11, height: 17, unit: "in" },
  { name: "SuperB", width: 13, height: 19, unit: "in" },
  { name: "ArchA", width: 9, height: 12, unit: "in" },
  { name: "ArchB", width: 18, height: 12, unit: "in" },
  { name: "A4", width: 210, height: 297, unit: "mm" },
  { name: "A3", width: 297, height: 420, unit: "mm" },
  { name: "A2", width: 420, height: 594, unit: "mm" },
  { name: "A1", width: 594, height: 841, unit: "mm" },
  { name: "Custom", width: 0, height: 0, unit: "in" },
];

const getPresetLabel = (preset: PresetOption, orientation: PageOrientation) => {
  if (preset.name === "Custom") {
    return "Custom";
  }

  const size =
    orientation === "landscape"
      ? `${preset.height}${preset.unit} × ${preset.width}${preset.unit}`
      : `${preset.width}${preset.unit} × ${preset.height}${preset.unit}`;

  return `${preset.name} (${size})`;
};

export function PageSizeControl() {
  const pageSizeUnit = useSettingsStore((state) => state.pageSizeUnit);
  const pageOrientation = useSettingsStore((state) => state.pageOrientation);

  const pageSizePreset = useSettingsStore((state) => state.pageSizePreset);
  const pageWidth = useSettingsStore((state) => state.pageWidth);
  const pageHeight = useSettingsStore((state) => state.pageHeight);

  const setPageSizePreset = useSettingsStore(
    (state) => state.setPageSizePreset
  );
  const setPageWidth = useSettingsStore((state) => state.setPageWidth);
  const setPageHeight = useSettingsStore((state) => state.setPageHeight);
  const setPageSizeUnit = useSettingsStore((state) => state.setPageSizeUnit);
  const swapPageOrientation = useSettingsStore(
    (state) => state.swapPageOrientation
  );

  const isCustom = pageSizePreset === "Custom";

  // Local state for input values to prevent focus loss while typing
  const [localWidth, setLocalWidth] = useState(pageWidth.toFixed(2));
  const [localHeight, setLocalHeight] = useState(pageHeight.toFixed(2));

  // Sync local state when store values change (e.g., preset change, unit toggle)
  useEffect(() => {
    setLocalWidth(pageWidth.toFixed(2));
    setLocalHeight(pageHeight.toFixed(2));
  }, [pageWidth, pageHeight]);

  const handleWidthCommit = () => {
    const value = parseFloat(localWidth);
    if (!isNaN(value) && value > 0) {
      setPageWidth(value);
    } else {
      // Reset to store value if invalid
      setLocalWidth(pageWidth.toFixed(2));
    }
  };

  const handleHeightCommit = () => {
    const value = parseFloat(localHeight);
    if (!isNaN(value) && value > 0) {
      setPageHeight(value);
    } else {
      // Reset to store value if invalid
      setLocalHeight(pageHeight.toFixed(2));
    }
  };

  return (
    <div className="space-y-4">
      <Label htmlFor="page-size-select" className="block mb-1">Page size</Label>

      <Select
        id="page-size-select"
        value={pageSizePreset}
        onChange={(e) => {
          const value = e.target.value as LayoutPreset;
          setPageSizePreset(value);
        }}
      >
        {layoutPresets.map((preset) => (
          <option key={preset.name} value={preset.name}>
            {getPresetLabel(preset, pageOrientation)}
          </option>
        ))}
      </Select>

      <div className="grid grid-cols-[1fr_min-content_1fr] gap-x-2 gap-y-1 items-center">
        <Label htmlFor="page-width-input">Page width ({pageSizeUnit})</Label>
        <div />
        <Label htmlFor="page-height-input">Page height ({pageSizeUnit})</Label>

        <NumberInput
          id="page-width-input"
          disabled={!isCustom}
          value={localWidth}
          onChange={(e) => setLocalWidth(e.target.value)}
          onBlur={handleWidthCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleWidthCommit();
            }
          }}
          step={0.1}
          min={0.1}
        />
        <div className="text-white">×</div>
        <NumberInput
          id="page-height-input"
          disabled={!isCustom}
          value={localHeight}
          onChange={(e) => setLocalHeight(e.target.value)}
          onBlur={handleHeightCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleHeightCommit();
            }
          }}
          step={0.1}
          min={0.1}
        />
      </div>

      {isCustom && (
        <div className="flex items-center justify-between">
          <Label htmlFor="unit-toggle">Unit</Label>
          <div className="flex items-center gap-2">
            <span className={pageSizeUnit === "in" ? "text-white" : "text-gray-400"}>
              inches
            </span>
            <ToggleSwitch
              id="unit-toggle"
              checked={pageSizeUnit === "mm"}
              onChange={() => {
                setPageSizeUnit(pageSizeUnit === "in" ? "mm" : "in");
              }}
            />
            <span className={pageSizeUnit === "mm" ? "text-white" : "text-gray-400"}>
              mm
            </span>
          </div>
        </div>
      )}

      <Button className="w-full" color="blue" onClick={swapPageOrientation}>
        <RefreshCw className="size-4 mr-2" />
        Swap Orientation
      </Button>
    </div>
  );
}
