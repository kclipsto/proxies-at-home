
import fullLogo from "@/assets/fullLogo.png";
import { LANGUAGE_OPTIONS } from "@/constants";
import { useSettingsStore } from "@/store/settings";
import {
  HR,
  Select,
} from "flowbite-react";
import { ExternalLink, HelpCircle, Download, MousePointerClick, Move, Copy, Upload } from "lucide-react";
import { AutoTooltip } from "./AutoTooltip";
import { PullToRefresh } from "./PullToRefresh";
import { DecklistUploader } from "./UploadComponents/DecklistUploader";
import { FileUploader } from "./UploadComponents/FileUploader";
import { MpcImportSection } from "./UploadComponents/MpcImportSection";

type Props = {
  isCollapsed?: boolean;
  cardCount: number;
  mobile?: boolean;
  onUploadComplete?: () => void;
};

export function UploadSection({ isCollapsed, cardCount, mobile, onUploadComplete }: Props) {
  const globalLanguage = useSettingsStore((s) => s.globalLanguage ?? "en");


  const setGlobalLanguage = useSettingsStore(
    (s) => s.setGlobalLanguage ?? (() => { })
  );

  const toggleUploadPanel = useSettingsStore((state) => state.toggleUploadPanel);

  if (isCollapsed) {
    return (
      <div
        className={`h-full flex flex-col bg-gray-100 dark:bg-gray-700 items-center py-4 gap-4 border-r border-gray-200 dark:border-gray-600 ${mobile ? "mobile-scrollbar-hide" : "overflow-y-auto"} select-none`}
        onDoubleClick={() => toggleUploadPanel()}
      >
        <AutoTooltip content="Proxxied" placement="right" mobile={mobile}>
          <button
            onClick={() => {
              toggleUploadPanel();
            }}
            className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <img src="/logo.svg" className="w-8 h-8" alt="Proxxied Logo" />
          </button>
        </AutoTooltip>
      </div>
    );
  }

  return (
    <div className={`w-full h-full dark:bg-gray-700 bg-gray-100 flex flex-col border-r border-gray-200 dark:border-gray-600`}>
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

            </div>

            {/* Language Selector - Moved here for Landscape */}
            <div className={`space-y-1 hidden ${mobile ? 'landscape:block' : ''}`}>
              <div className="flex items-center justify-between">
                <h6 className="font-medium dark:text-white">Language</h6>
                <AutoTooltip content="Used for Scryfall lookups" mobile={mobile}>
                  <HelpCircle className="w-4 h-4 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 cursor-pointer" />
                </AutoTooltip>
              </div>

              <Select
                className="w-full rounded-md bg-gray-300 dark:bg-gray-600 mt-2 text-sm text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-500"
                value={globalLanguage}
                onChange={(e) => setGlobalLanguage(e.target.value)}
              >
                {LANGUAGE_OPTIONS.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <HR className={`my-0 dark:bg-gray-500 ${mobile ? 'landscape:hidden' : ''}`} />

          {/* Decklist Uploader */}
          <DecklistUploader mobile={mobile} cardCount={cardCount} onUploadComplete={onUploadComplete} />

        </div>

        {/* Tips - Full width at bottom */}
        {/* ... (Tips section remains same but reduced indent/complexity here) ... */}
        <div className={`${mobile ? 'landscape:col-span-2' : ''} pb-4`}>
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
              <span>To move a card - {mobile ? "long press and drag" : "drag from the box at the top right"}</span>
            </div>
            <div className="flex items-center gap-2 bg-gray-300 dark:bg-gray-600 p-2 rounded-md h-full">
              <Copy className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
              <span>To duplicate or delete a card - {mobile ? "double tap" : "right click"} it</span>
            </div>
            <div className="flex items-center gap-2 bg-gray-300 dark:bg-gray-600 p-2 rounded-md h-full">
              <Upload className="w-4 h-4 shrink-0 text-cyan-600 dark:text-cyan-400" />
              <span>You can upload images from mtgcardsmith, custom designs, etc.</span>
            </div>
          </div>
        </div>

      </PullToRefresh>
    </div>
  );
}
