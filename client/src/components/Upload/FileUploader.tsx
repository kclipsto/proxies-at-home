import React, { useState } from "react";
import { inferCardNameFromFilename } from "@/helpers/mpc";
import { undoableAddCards } from "@/helpers/undoableActions";
import { addCustomImage } from "@/helpers/dbUtils";
import { useLoadingStore } from "@/store/loading";
import { useToastStore } from "@/store/toast";
import { Upload } from "lucide-react";
import { db } from "@/db";
import { SplitButton, type SplitButtonOption } from "../common";
import type { CardOption } from "../../../../shared/types";

type UploadMode = "standard" | "withBleed" | "cardback";

const UPLOAD_MODE_OPTIONS: SplitButtonOption<UploadMode>[] = [
    { value: "standard", label: "Without Bleed", description: "Like images from Scryfall" },
    { value: "withBleed", label: "With Bleed", description: "Like images from MPC Autofill" },
    { value: "cardback", label: "Cardback", description: "Custom card back for printing" },
];

type Props = {
    mobile?: boolean;
    onUploadComplete?: () => void;
};

export function FileUploader({ mobile, onUploadComplete }: Props) {
    const setLoadingTask = useLoadingStore((state) => state.setLoadingTask);
    const [uploadMode, setUploadMode] = useState<UploadMode>("standard");
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

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

    const sublabel = uploadMode === "cardback" ? "Cardback" : uploadMode === "withBleed" ? "With Bleed" : "Without Bleed";
    const inputId = "upload-images-unified";

    return (
        <div className={`space-y-1 ${mobile ? '' : ''}`}>
            <h6 className="font-medium dark:text-white sr-only">Upload Images</h6>

            <SplitButton
                label="Upload Images"
                sublabel={sublabel}
                color="gray"
                icon={Upload}
                asLabel
                htmlFor={inputId}
                onClick={() => { }}
                isOpen={isDropdownOpen}
                onToggle={() => setIsDropdownOpen(!isDropdownOpen)}
                onClose={() => setIsDropdownOpen(false)}
                options={UPLOAD_MODE_OPTIONS}
                value={uploadMode}
                onSelect={setUploadMode}
            />

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
        </div>
    );
}
