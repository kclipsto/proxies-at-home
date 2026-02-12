import fullLogo from "@/assets/fullLogo.png";
import { logoSvg } from "@/assets";

import {
  HR,
} from "flowbite-react";
import { ExternalLink, Download, MousePointerClick, Move, Copy, Upload, Layers } from "lucide-react";
import { AutoTooltip } from "./common";
import { PullToRefresh } from "./PullToRefresh";
import {
  DeckBuilderImporter,
  DecklistUploader,
  FileUploader,
  MpcImportSection
} from "./Upload";

type Props = {
  isCollapsed?: boolean;
  onToggle?: () => void;
  cardCount: number;
  mobile?: boolean;
  onUploadComplete?: () => void;
};

export function UploadSection({ isCollapsed, onToggle, cardCount, mobile, onUploadComplete }: Props) {
  if (isCollapsed) {
    return (
      <div
        className={`h-full flex flex-col bg-gray-100 dark:bg-gray-700 items-center py-4 gap-4 border-r border-gray-200 dark:border-gray-600 ${mobile ? "mobile-scrollbar-hide" : "overflow-y-auto"} select-none`}
        onDoubleClick={() => onToggle?.()}
      >
        <AutoTooltip content="Proxxied" placement="right" mobile={mobile}>
          <button
            onClick={() => {
              onToggle?.();
            }}
            className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <img src={logoSvg} className="w-8 h-8" alt="Proxxied Logo" />
          </button>
        </AutoTooltip>
      </div>
    );
  }

  return (
    <div className={`w-full h-full dark:bg-gray-700 bg-gray-100 flex flex-col border-r border-gray-200 dark:border-gray-600 select-none`}>
      {!mobile && (
        <div>
          <img src={fullLogo} alt="Proxxied Logo" className="w-full" />
        </div>
      )}

      <PullToRefresh className={`flex-1 flex flex-col overflow-y-auto gap-6 px-4 pb-4 pt-4 ${mobile ? "[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" : ""}`}>
        {mobile && (
          <div className={`flex justify-center mb-2 ${mobile ? 'landscape:hidden' : ''}`}>
            <img src={fullLogo} alt="Proxxied Logo" className="w-[80%] landscape:w-auto landscape:h-12" />
          </div>
        )}
        <div className={`flex flex-col ${mobile ? 'landscape:grid landscape:grid-cols-2 landscape:gap-6 landscape:h-full landscape:grid-rows-[1fr_auto]' : ''} gap-4`}>
          <div className={`flex flex-col gap-4 ${mobile ? 'landscape:gap-2 landscape:h-full landscape:justify-between' : ''}`}>
            <div className={`flex flex-col gap-4 ${mobile ? 'landscape:gap-2' : ''}`}>
              {/* Logo for Landscape */}
              <div className={`hidden ${mobile ? 'landscape:flex' : ''} justify-center mb-2`}>
                <img src={fullLogo} alt="Proxxied Logo" className={`w-[80%] ${mobile ? 'landscape:w-[50%]' : ''} h-auto`} />
              </div>

              {/* File Uploaders */}
              <FileUploader mobile={mobile} onUploadComplete={onUploadComplete} />
              <MpcImportSection mobile={mobile} onUploadComplete={onUploadComplete} />

              {/* Deck Builder Importer - in landscape, show here below MPC */}
              <div className={`hidden ${mobile ? 'landscape:block' : ''}`}>
                <DeckBuilderImporter mobile={mobile} onUploadComplete={onUploadComplete} />
              </div>
            </div>
          </div>

          <HR className={`my-0 dark:bg-gray-500 ${mobile ? 'landscape:hidden' : ''}`} />

          {/* Decklist Uploader */}
          <DecklistUploader mobile={mobile} cardCount={cardCount} onUploadComplete={onUploadComplete} />

          <HR className={`my-0 dark:bg-gray-500 ${mobile ? 'landscape:hidden' : ''}`} />

          {/* Deck Builder Importer - in portrait, show here */}
          <div className={`${mobile ? 'landscape:hidden' : ''}`}>
            <DeckBuilderImporter mobile={mobile} onUploadComplete={onUploadComplete} />
          </div>

          <HR className={`my-0  dark:bg-gray-500 ${mobile ? 'landscape:hidden' : ''}`} />
        </div>

        {/* Tips - Full width at bottom */}
        {/* ... (Tips section remains same but reduced indent/complexity here) ... */}
        <div className={`mt-4 ${mobile ? 'landscape:col-span-2' : ''} pb-4`}>
          <h6 className="font-medium dark:text-white mb-2">Tips:</h6>

          <div className={`text-sm dark:text-white/60 flex flex-col gap-2 ${mobile ? 'landscape:grid landscape:grid-cols-2' : ''}`}>
            <div className="flex items-center gap-2 bg-gray-300 dark:bg-gray-600 p-2 rounded-md h-full">
              <Download className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <span>
                Download images from{" "}
                <a
                  href="https://mpcfill.com"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-blue-600 dark:hover:text-blue-400"
                >
                  MPC Autofill
                  <ExternalLink className="inline-block size-3 ml-1" />
                </a>
              </span>
            </div>
            <div className="flex items-center gap-2 bg-gray-300 dark:bg-gray-600 p-2 rounded-md h-full">
              <MousePointerClick className="w-4 h-4 shrink-0 text-purple-600 dark:text-purple-400" />
              <span>To change a card art - {mobile ? "tap" : "click"} it</span>
            </div>
            <div className="flex items-center gap-2 bg-gray-300 dark:bg-gray-600 p-2 rounded-md h-full">
              <Move className="w-4 h-4 shrink-0 text-green-600 dark:text-green-400" />
              <span>To move a card - {mobile ? "long press and drag" : "just drag it"}</span>
            </div>
            <div className="flex items-center gap-2 bg-gray-300 dark:bg-gray-600 p-2 rounded-md h-full">
              <Copy className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
              <span>To duplicate or delete a card - {mobile ? "double tap" : "right click"} it</span>
            </div>
            <div className="flex items-center gap-2 bg-gray-300 dark:bg-gray-600 p-2 rounded-md h-full">
              <Upload className="w-4 h-4 shrink-0 text-cyan-600 dark:text-cyan-400" />
              <span>You can upload images from mtgcardsmith, custom designs, etc.</span>
            </div>
            <div className="flex items-center gap-2 bg-gray-300 dark:bg-gray-600 p-2 rounded-md h-full">
              <Layers className="w-4 h-4 shrink-0 text-orange-600 dark:text-orange-400" />
              <span>
                Import from{" "}
                <a
                  href="https://archidekt.com"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-orange-600 dark:hover:text-orange-400"
                >
                  Archidekt
                </a>
                {" "}or{" "}
                <a
                  href="https://moxfield.com"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-purple-600 dark:hover:text-purple-400"
                >
                  Moxfield
                </a>
                {" "}to filter by deck categories
              </span>
            </div>
          </div>
        </div>

      </PullToRefresh>
    </div>
  );
}
