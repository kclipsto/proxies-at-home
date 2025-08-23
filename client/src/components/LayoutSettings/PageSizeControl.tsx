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
  { name: "A4", width: 210, height: 297, unit: "mm" },
  { name: "Tabloid", width: 11, height: 17, unit: "in" },
  { name: "A3", width: 297, height: 420, unit: "mm" },
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
      <Label className="block mb-1">Page size</Label>

      <Select
        value={pageSizePreset}
        onChange={(e) => {
          const value = e.target.value as LayoutPreset;
          setPageSizePreset(value);
        }}
      >
        {layoutPresets.map((preset) => (
          <option value={preset.name}>
            {getPresetLabel(preset, pageOrientation)}
          </option>
        ))}
      </Select>

      <div className="grid grid-cols-[1fr_min-content_1fr] gap-x-2 gap-y-1 items-center">
        <Label>Page width ({pageSizeUnit})</Label>
        <div />
        <Label>Page height ({pageSizeUnit})</Label>

        <TextInput disabled value={pageWidthIn} />
        <div className="text-white">×</div>
        <TextInput disabled value={pageHeightIn} />
      </div>

      <Button className="w-full" color="blue" onClick={swapPageOrientation}>
        <RefreshCw className="size-4 mr-2" />
        Swap Orientation
      </Button>
    </div>
  );
}
