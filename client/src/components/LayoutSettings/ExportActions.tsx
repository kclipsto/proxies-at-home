import { buildDecklist, downloadDecklist } from "@/helpers/DecklistHelper";
import { ExportImagesZip } from "@/helpers/ExportImagesZip";
import { exportProxyPagesToPdf } from "@/helpers/ExportProxyPageToPdf";
import { useCardsStore } from "@/store/cards";
import { useLoadingStore } from "@/store/loading";
import { useSettingsStore } from "@/store/settings";
import { Button } from "flowbite-react";

export function ExportActions() {
  const setLoadingTask = useLoadingStore((state) => state.setLoadingTask);
  const cards = useCardsStore((state) => state.cards);
  const originalSelectedImages = useCardsStore(
    (state) => state.originalSelectedImages
  );
  const pageOrientation = useSettingsStore((state) => state.pageOrientation);
  const pageSizePreset = useSettingsStore((state) => state.pageSizePreset);
  const pageSizeUnit = useSettingsStore((state) => state.pageSizeUnit);
  const pageWidth = useSettingsStore((state) => state.pageWidth);
  const pageHeight = useSettingsStore((state) => state.pageHeight);
  const columns = useSettingsStore((state) => state.columns);
  const rows = useSettingsStore((state) => state.rows);
  const bleedEdgeWidth = useSettingsStore((state) => state.bleedEdgeWidth);
  const bleedEdge = useSettingsStore((state) => state.bleedEdge);
  const guideColor = useSettingsStore((state) => state.guideColor);
  const guideWidth = useSettingsStore((state) => state.guideWidth);

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
    await exportProxyPagesToPdf({
      cards,
      originalSelectedImages,
      bleedEdge,
      bleedEdgeWidthMm: bleedEdgeWidth,
      guideColor,
      guideWidthPx: guideWidth,
      pageOrientation,
      pageSizePreset,
      pageSizeUnit,
      pageWidth,
      pageHeight,
      columns,
      rows,
    });

    setLoadingTask(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <Button color="green" onClick={handleExport} disabled={!cards.length}>
        Export to PDF
      </Button>
      <Button
        color="indigo"
        onClick={() =>
          ExportImagesZip({
            cards,
            originalSelectedImages,
            fileBaseName: "card_images",
          })
        }
        disabled={!cards.length}
      >
        Export Card Images (.zip)
      </Button>
      <Button color="cyan" onClick={handleCopyDecklist}>
        Copy Decklist
      </Button>
      <Button color="blue" onClick={handleDownloadDecklist}>
        Download Decklist (.txt)
      </Button>
    </div>
  );
}
