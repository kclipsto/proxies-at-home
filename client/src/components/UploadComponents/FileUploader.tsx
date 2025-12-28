import React, { useState, useRef, useEffect } from "react";
import { inferCardNameFromFilename } from "@/helpers/Mpc";
import { undoableAddCards } from "@/helpers/undoableActions";
import { addCustomImage } from "@/helpers/dbUtils";
import { useLoadingStore } from "@/store/loading";
import { useToastStore } from "@/store/toast";
import { ChevronDown } from "lucide-react";
import { db } from "@/db";
import type { CardOption } from "../../../../shared/types";

type UploadMode = "standard" | "withBleed" | "cardback";

type Props = {
    mobile?: boolean;
    onUploadComplete?: () => void;
};

export function FileUploader({ mobile, onUploadComplete }: Props) {
    const setLoadingTask = useLoadingStore((state) => state.setLoadingTask);
    const [uploadMode, setUploadMode] = useState<UploadMode>("standard");
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    async function addUploadedFiles(
        files: FileList,
        opts: { hasBuiltInBleed: boolean; isCardback?: boolean }
    ) {
        const fileArray = Array.from(files);

        // For cardbacks, add to the cardbacks table (not images)
        if (opts.isCardback) {
            for (const file of fileArray) {
                // Generate a unique ID for the cardback
                const imageId = `cardback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                // Get the cardback name from filename
                const cardbackName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension

                // Add to cardbacks table
                await db.cardbacks.add({
                    id: imageId,
                    refCount: 0,
                    originalBlob: file,
                    displayName: cardbackName,
                    hasBuiltInBleed: true, // User uploads are assumed to have bleed
                });
            }
            // Show toast
            const count = fileArray.length;
            useToastStore.getState().showSuccessToast(
                count === 1 ? "cardback to library" : `${count} cardbacks to library`
            );
            return;
        }

        // Regular card uploads
        const cardsToAdd: Array<
            Omit<CardOption, "uuid" | "order"> & { imageId: string }
        > = [];

        for (const file of fileArray) {
            const suffix = opts.hasBuiltInBleed ? "-mpc" : "-std";
            const imageId = await addCustomImage(file, suffix);

            // Custom image uploads default to no darken pixels (already optimized for print)
            cardsToAdd.push({
                name: inferCardNameFromFilename(file.name) || `Custom Art`,
                imageId: imageId,
                isUserUpload: true,
                hasBuiltInBleed: opts.hasBuiltInBleed,
                needsEnrichment: true,
                overrides: {
                    darkenMode: 'none',
                    darkenUseGlobalSettings: false,
                },
            });
        }

        if (cardsToAdd.length > 0) {
            await undoableAddCards(cardsToAdd);
            onUploadComplete?.();
        }
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const hasBuiltInBleed = uploadMode === "withBleed" || uploadMode === "cardback";
            const isCardback = uploadMode === "cardback";

            // Only show loading for non-cardback uploads (cardbacks are fast - no card creation)
            if (!isCardback) {
                setLoadingTask("Processing Images");
            }
            try {
                await addUploadedFiles(e.target.files, { hasBuiltInBleed, isCardback });
            } finally {
                if (!isCardback) {
                    setLoadingTask(null);
                }
            }
        }
    };

    const buttonLabel = uploadMode === "cardback" ? "Upload Cardback" : uploadMode === "withBleed" ? "Upload Images with Bleed" : "Upload Images";
    const inputId = "upload-images-unified";

    return (
        <div className={`space-y-1 ${mobile ? '' : ''}`} ref={dropdownRef}>
            <h6 className="font-medium dark:text-white sr-only">Upload Images</h6>

            <div className="relative flex w-full">
                {/* Main upload button */}
                <label
                    htmlFor={inputId}
                    className={`pl-10 pr-0 flex-1 text-center cursor-pointer rounded-l-md bg-gray-300 dark:bg-gray-600 ${mobile ? 'px-4 py-4 landscape:py-3' : 'px-4 py-3'} text-base font-medium text-gray-900 dark:text-white hover:bg-gray-400 dark:hover:bg-gray-500 active:translate-y-[2px] transition-colors`}
                >
                    {buttonLabel}
                </label>

                {/* Dropdown toggle button */}
                <button
                    type="button"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className={`flex items-center justify-center cursor-pointer rounded-r-md bg-gray-300 dark:bg-gray-600 border-l border-gray-400 dark:border-gray-500 ${mobile ? 'px-3 py-4 landscape:py-3' : 'px-3 py-3'} text-gray-900 dark:text-white hover:bg-gray-400 dark:hover:bg-gray-500 active:translate-y-[2px] transition-colors`}
                    aria-label="Select upload mode"
                    aria-expanded={isDropdownOpen}
                    aria-haspopup="listbox"
                >
                    <ChevronDown className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Hidden file input */}
                <input
                    id={inputId}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileUpload}
                    onClick={(e) => ((e.target as HTMLInputElement).value = "")}
                    className="hidden"
                />

                {/* Dropdown menu */}
                {isDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white dark:bg-gray-700 rounded-md shadow-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
                        <button
                            type="button"
                            onClick={() => {
                                setUploadMode("standard");
                                setIsDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors ${uploadMode === "standard" ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" : "text-gray-900 dark:text-white"}`}
                        >
                            Upload Images
                            <span className="block text-xs text-gray-500 dark:text-gray-400">Without bleed, like from Scryfall</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setUploadMode("withBleed");
                                setIsDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors ${uploadMode === "withBleed" ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" : "text-gray-900 dark:text-white"}`}
                        >
                            Upload Images with Bleed
                            <span className="block text-xs text-gray-500 dark:text-gray-400">With bleed built-in, like from MPC Autofill</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setUploadMode("cardback");
                                setIsDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors ${uploadMode === "cardback" ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" : "text-gray-900 dark:text-white"}`}
                        >
                            Upload Cardback
                            <span className="block text-xs text-gray-500 dark:text-gray-400">Custom card back for printing</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
