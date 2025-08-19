import { Button, Checkbox, Label, TextInput } from "flowbite-react";
import { buildDecklist, downloadDecklist } from "../helpers/DecklistHelper";
import { ExportImagesZip } from "../helpers/ExportImagesZip";
import { exportProxyPagesToPdf } from "../helpers/ExportProxyPageToPdf";
import { useImageProcessing } from "../hooks/useImageProcessing";
import type { LoadingTask } from "../pages/ProxyBuilderPage";
import { usePageSettings } from "../providers/PageSettings";
import type { CardOption } from "../types/Card";
import Donate from "./Donate";

const unit = "mm";
const pdfPageColor = "#FFFFFF";

export function PageSettingsControls({
  cards,
  originalSelectedImages,
  setLoadingTask,
  setIsLoading,
  setOriginalSelectedImages,
  selectedImages,
  setSelectedImages,
}: {
  cards: CardOption[];
  originalSelectedImages: Record<string, string>;
  setLoadingTask: React.Dispatch<React.SetStateAction<LoadingTask>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setOriginalSelectedImages: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  selectedImages: Record<string, string>;
  setSelectedImages: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
}) {
  const {
    pageWidthIn,
    setPageWidthIn,
    pageHeightIn,
    setPageHeightIn,
    columns,
    setColumns,
    rows,
    setRows,
    bleedEdgeWidth,
    setBleedEdgeWidth,
    bleedEdge,
    setBleedEdge,
    guideColor,
    setGuideColor,
    guideWidth,
    setGuideWidth,
    zoom,
    setZoom,
  } = usePageSettings();

  const { reprocessSelectedImages } = useImageProcessing({
    unit, // "mm" | "in"
    bleedEdgeWidth, // number
    selectedImages,
    setSelectedImages,
    originalSelectedImages,
    setOriginalSelectedImages,
  });

  const handleCopyDecklist = async () => {
    const text = buildDecklist(cards, { style: "withSetNum", sort: "alpha" });
    await navigator.clipboard.writeText(text);
  };

  const handleDownloadDecklist = () => {
    const text = buildDecklist(cards, { style: "withSetNum", sort: "alpha" });
    const date = new Date().toISOString().slice(0, 10);
    downloadDecklist(`decklist_${date}.txt`, text);
  };
  const handleExport = async () => {
    setLoadingTask("Generating PDF");
    setIsLoading(true);
    await exportProxyPagesToPdf({
      cards,
      originalSelectedImages,
      bleedEdge,
      bleedEdgeWidthMm: bleedEdgeWidth,
      guideColor,
      guideWidthPx: guideWidth,
      pageWidthInches: pageWidthIn,
      pageHeightInches: pageHeightIn,
      pdfPageColor,
      columns,
      rows,
    });
    setIsLoading(false);
    setLoadingTask(null);
  };

  return (
    <div className="w-1/4 min-w-[18rem] max-w-[26rem] p-4 bg-gray-100 dark:bg-gray-700 h-full flex flex-col overflow-y-auto">
      <Label className="text-lg font-semibold dark:text-gray-300">
        Settings
      </Label>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Page Width (in)</Label>
            <TextInput
              className="w-full"
              type="number"
              step="0.1"
              min="1"
              value={pageWidthIn}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v > 0) setPageWidthIn(v);
              }}
            />
          </div>
          <div>
            <Label>Page Height (in)</Label>
            <TextInput
              className="w-full"
              type="number"
              step="0.1"
              min="1"
              value={pageHeightIn}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v > 0) setPageHeightIn(v);
              }}
            />
          </div>
        </div>

        <Button
          className="bg-gray-300 text-gray-900 w-full"
          onClick={() => {
            setPageWidthIn(pageHeightIn);
            setPageHeightIn(pageWidthIn);
          }}
        >
          Swap Orientation
        </Button>

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
                const v = Math.max(
                  1,
                  Math.min(10, parseInt(e.target.value || "1", 10))
                );
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
                const v = Math.max(
                  1,
                  Math.min(10, parseInt(e.target.value || "1", 10))
                );
                if (!Number.isNaN(v)) setRows(v);
              }}
            />
          </div>
        </div>

        <div>
          <Label>Bleed Edge ({unit})</Label>
          <TextInput
            className="w-full"
            type="number"
            value={bleedEdgeWidth}
            max={2}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              if (!isNaN(val)) {
                setBleedEdgeWidth(val);
                reprocessSelectedImages(cards, val);
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
          <Label htmlFor="bleed-edge">Enable Guide</Label>
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
              className="bg-gray-300 text-gray-900 w-full focus:ring-0"
              onClick={() => setZoom(Math.max(0.1, zoom - 0.1))}
            >
              -
            </Button>
            <Label className="w-full text-center">{zoom.toFixed(1)}x</Label>
            <Button
              size="xs"
              className="bg-gray-300 text-gray-900 w-full focus:ring-0"
              onClick={() => setZoom(zoom + 0.1)}
            >
              +
            </Button>
          </div>
        </div>

        <Button
          className="bg-green-700 w-full"
          color="success"
          onClick={handleExport}
        >
          Export to PDF
        </Button>
        <Button
          className="bg-indigo-700 w-full"
          onClick={() =>
            ExportImagesZip({
              cards,
              originalSelectedImages,
              fileBaseName: "card_images",
            })
          }
        >
          Export Card Images (.zip)
        </Button>
        <Button className="bg-blue-700 w-full" onClick={handleCopyDecklist}>
          Copy Decklist
        </Button>
        <Button
          className="bg-blue-500 w-full mt-2"
          onClick={handleDownloadDecklist}
        >
          Download Decklist (.txt)
        </Button>
      </div>

      <div className="mt-auto space-y-3 pt-4">
        <Donate username="Kaiser-Clipston-1" />
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
