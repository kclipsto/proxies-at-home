import React, { useState } from "react";
import { inferCardNameFromFilename } from "@/helpers/mpc";
import { addCustomImage } from "@/helpers/dbUtils";
import type { ImportIntent } from "@/helpers/importParsers";
import { useLoadingStore } from "@/store/loading";
import { useToastStore } from "@/store/toast";
import { useCardImport } from "@/hooks/useCardImport";
import { Upload } from "lucide-react";
import { db } from "@/db";
import { SplitButton, type SplitButtonOption } from "../common";

type UploadMode = "standard" | "withBleed" | "cardback" | "auto";

const UPLOAD_MODE_OPTIONS: SplitButtonOption<UploadMode>[] = [
    { value: "auto", label: "Auto Detect Bleed", description: "Detect built in bleed" },
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
    const [uploadMode, setUploadMode] = useState<UploadMode>("auto");
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const { processCards } = useCardImport({
        onComplete: () => onUploadComplete?.()
    });

    async function addUploadedFiles(
        files: FileList,
        opts: { hasBuiltInBleed?: boolean; isCardback?: boolean }
    ) {
        const fileArray = Array.from(files);

        if (opts.isCardback) {
            for (const file of fileArray) {
                const imageId = `cardback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const cardbackName = file.name.replace(/\.[^/.]+$/, "");

                await db.cardbacks.add({
                    id: imageId,
                    originalBlob: file,
                    displayName: cardbackName,
                    hasBuiltInBleed: true,
                });
            }
            const count = fileArray.length;
            useToastStore.getState().showSuccessToast(
                count === 1 ? "cardback to library" : `${count} cardbacks to library`
            );
            return;
        }

        const intents: ImportIntent[] = [];

        for (const file of fileArray) {
            let suffix = "-std";
            if (opts.hasBuiltInBleed === true) suffix = "-mpc";
            if (opts.hasBuiltInBleed === undefined) suffix = "-auto";

            const imageId = await addCustomImage(file, suffix);

            const intent: ImportIntent = {
                name: inferCardNameFromFilename(file.name) || `Custom Art`,
                quantity: 1,
                isToken: false,
                localImageId: imageId,
                preloadedData: {
                    hasBuiltInBleed: opts.hasBuiltInBleed,
                },
                cardOverrides: {
                    darkenMode: 'none',
                    darkenUseGlobalSettings: false,
                },
                sourcePreference: 'manual'
            };
            intents.push(intent);
        }

        if (intents.length > 0) {
            await processCards(intents);
        }
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const isCardback = uploadMode === "cardback";

            if (!isCardback) {
                setLoadingTask("Processing Images");
            }
            try {
                if (uploadMode === 'auto') {
                    // Fast path: No detection here, let the pipeline handle it
                    await addUploadedFiles(e.target.files, { hasBuiltInBleed: undefined, isCardback: false });
                } else {
                    const hasBuiltInBleed = uploadMode === "withBleed" || uploadMode === "cardback";
                    await addUploadedFiles(e.target.files, { hasBuiltInBleed, isCardback });
                }

            } finally {
                if (!isCardback) {
                    setLoadingTask(null);
                }
            }
        }
    };

    const inputId = "upload-images-unified";
    return (
        <div className={`space-y-1 ${mobile ? '' : ''}`}>
            <h6 className="font-medium dark:text-white sr-only">Upload Images</h6>

            <SplitButton
                label="Upload Images"
                sublabel={UPLOAD_MODE_OPTIONS.find((o) => o.value === uploadMode)?.label}
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
