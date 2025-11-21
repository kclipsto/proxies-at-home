import { useSettingsStore } from "@/store";
import type { LayoutPreset, PageOrientation } from "@/store/settings";
import { Button, Label, Select, TextInput } from "flowbite-react";
import { RefreshCw } from "lucide-react";

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
];

const getPresetLabel = (preset: PresetOption, orientation: PageOrientation) => {
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
  const pageWidthIn = useSettingsStore((state) => state.pageWidth);
  const pageHeightIn = useSettingsStore((state) => state.pageHeight);

  const setPageSizePreset = useSettingsStore(
    (state) => state.setPageSizePreset
  );
  const swapPageOrientation = useSettingsStore(
    (state) => state.swapPageOrientation
  );

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

        <TextInput id="page-width-input" disabled value={pageWidthIn} />
        <div className="text-white">×</div>
        <TextInput id="page-height-input" disabled value={pageHeightIn} />
      </div>

      <Button className="w-full" color="blue" onClick={swapPageOrientation}>
        <RefreshCw className="size-4 mr-2" />
        Swap Orientation
      </Button>
    </div>
  );
}
