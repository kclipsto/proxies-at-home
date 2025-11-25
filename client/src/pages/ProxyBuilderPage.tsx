import { Suspense, lazy, useEffect, useMemo, useCallback } from "react";
import { ChevronRight } from "lucide-react";
import { ResizeHandle } from "../components/ResizeHandle";
import { PageSettingsControls } from "../components/PageSettingsControls";
import { UploadSection } from "../components/UploadSection";
import { useImageProcessing } from "../hooks/useImageProcessing";
import { useSettingsStore } from "../store";
import { db } from "../db";
import { ImageProcessor } from "../helpers/imageProcessor";
import { rebalanceCardOrders } from "@/helpers/dbUtils";

const PageView = lazy(() =>
  import("../components/PageView").then((module) => ({
    default: module.PageView,
  }))
);

function PageViewLoader() {
  return (
    <div className="w-1/2 flex-1 overflow-y-auto bg-gray-200 h-full p-6 flex justify-center items-center dark:bg-gray-800">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-400 border-t-transparent" />
    </div>
  );
}

export default function ProxyBuilderPage() {
  const bleedEdge = useSettingsStore((state) => state.bleedEdge);
  const bleedEdgeWidth = useSettingsStore((state) => state.bleedEdgeWidth);
  const darkenNearBlack = useSettingsStore((state) => state.darkenNearBlack);
  const settingsPanelWidth = useSettingsStore((state) => state.settingsPanelWidth);
  const setSettingsPanelWidth = useSettingsStore((state) => state.setSettingsPanelWidth);
  const isSettingsPanelCollapsed = useSettingsStore((state) => state.isSettingsPanelCollapsed);
  const toggleSettingsPanel = useSettingsStore((state) => state.toggleSettingsPanel);
  const imageProcessor = useMemo(() => ImageProcessor.getInstance(), []);

  const isUploadPanelCollapsed = useSettingsStore((state) => state.isUploadPanelCollapsed);
  const toggleUploadPanel = useSettingsStore((state) => state.toggleUploadPanel);
  const uploadPanelWidth = useSettingsStore((state) => state.uploadPanelWidth);
  const setUploadPanelWidth = useSettingsStore((state) => state.setUploadPanelWidth);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = settingsPanelWidth;
    let hasExpanded = !isSettingsPanelCollapsed;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = startX - e.clientX;

      // If collapsed and dragged more than 3px, expand
      if (!hasExpanded && Math.abs(delta) > 3) {
        toggleSettingsPanel();
        hasExpanded = true;
      }

      const newWidth = startWidth + delta;
      setSettingsPanelWidth(Math.max(250, Math.min(600, newWidth)));
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [settingsPanelWidth, setSettingsPanelWidth, isSettingsPanelCollapsed, toggleSettingsPanel]);

  const handleUploadPanelMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = uploadPanelWidth;
    let hasExpanded = !isUploadPanelCollapsed;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX;

      // If collapsed and dragged more than 3px, expand
      if (!hasExpanded && Math.abs(delta) > 3) {
        toggleUploadPanel();
        hasExpanded = true;
      }

      const newWidth = startWidth + delta;
      setUploadPanelWidth(Math.max(250, Math.min(600, newWidth)));
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [uploadPanelWidth, setUploadPanelWidth, isUploadPanelCollapsed, toggleUploadPanel]);

  const { loadingMap, ensureProcessed, reprocessSelectedImages, cancelProcessing } =
    useImageProcessing({
      unit: "mm",
      bleedEdgeWidth: bleedEdge ? bleedEdgeWidth : 0,
      imageProcessor,
      darkenNearBlack,
    });

  // On startup, rebalance card orders to prevent floating point issues.
  useEffect(() => {
    const timer = setTimeout(() => {
      void rebalanceCardOrders();
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  // On startup, find all unprocessed images and kick off processing for them
  useEffect(() => {
    const processAllUnprocessed = async () => {
      const allCards = await db.cards.toArray();
      const allImages = await db.images.toArray();
      const imagesById = new Map(allImages.map((img) => [img.id, img]));

      const unprocessedCards = allCards.filter((card) => {
        if (!card.imageId) return false;
        const img = imagesById.get(card.imageId);
        return !img?.displayBlob;
      });

      for (const card of unprocessedCards) {
        void ensureProcessed(card);
      }
    };

    // Delay ever so slightly to allow the main UI to render first
    const timer = setTimeout(() => processAllUnprocessed(), 100);
    return () => clearTimeout(timer);
  }, [ensureProcessed]);

  return (
    <div className="flex flex-row h-screen justify-between overflow-hidden">
      <div
        className="relative transition-all duration-200 ease-in-out z-30"
        style={{
          width: isUploadPanelCollapsed ? 60 : uploadPanelWidth,
          minWidth: isUploadPanelCollapsed ? 60 : uploadPanelWidth,
        }}
      >
        <UploadSection isCollapsed={isUploadPanelCollapsed} />
      </div>
      <ResizeHandle
        isCollapsed={isUploadPanelCollapsed}
        onToggle={toggleUploadPanel}
        onResizeStart={handleUploadPanelMouseDown}
        onReset={() => {
          setUploadPanelWidth(320);
          if (isUploadPanelCollapsed) toggleUploadPanel();
        }}
        className="-ml-2 -mr-2"
        side="left"
      />

      <Suspense fallback={<PageViewLoader />}>
        <PageView loadingMap={loadingMap} ensureProcessed={ensureProcessed} />
      </Suspense>
      <ResizeHandle
        isCollapsed={isSettingsPanelCollapsed}
        onToggle={toggleSettingsPanel}
        onResizeStart={handleMouseDown}
        onReset={() => {
          setSettingsPanelWidth(320);
          if (isSettingsPanelCollapsed) toggleSettingsPanel();
        }}
        className="-ml-2 -mr-2"
        side="right"
      />
      <div
        style={{
          width: isSettingsPanelCollapsed ? 60 : settingsPanelWidth,
          minWidth: isSettingsPanelCollapsed ? 60 : settingsPanelWidth,
          transition: "width 0.2s ease-in-out",
        }}
      >
        <PageSettingsControls
          reprocessSelectedImages={reprocessSelectedImages}
          cancelProcessing={cancelProcessing}
        />
      </div>
    </div >
  );
}
