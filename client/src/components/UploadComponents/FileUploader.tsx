import React from "react";
import { inferCardNameFromFilename } from "@/helpers/Mpc";
import { undoableAddCards } from "@/helpers/undoableActions";
import { addCustomImage } from "@/helpers/dbUtils";
import { useLoadingStore } from "@/store/loading";
import type { CardOption } from "../../../../shared/types";

type Props = {
    mobile?: boolean;
    onUploadComplete?: () => void;
};

export function FileUploader({ mobile, onUploadComplete }: Props) {
    const setLoadingTask = useLoadingStore((state) => state.setLoadingTask);

    async function addUploadedFiles(
        files: FileList,
        opts: { hasBakedBleed: boolean }
    ) {
        const fileArray = Array.from(files);

        const cardsToAdd: Array<
            Omit<CardOption, "uuid" | "order"> & { imageId: string }
        > = [];

        for (const file of fileArray) {
            const suffix = opts.hasBakedBleed ? "-mpc" : "-std";
            const imageId = await addCustomImage(file, suffix);
            cardsToAdd.push({
                name: inferCardNameFromFilename(file.name) || `Custom Art`,
                imageId: imageId,
                isUserUpload: true,
                hasBakedBleed: opts.hasBakedBleed,
                needsEnrichment: true, // Try to fetch metadata based on inferred card name
            });
        }

        if (cardsToAdd.length > 0) {
            await undoableAddCards(cardsToAdd);
            onUploadComplete?.();
        }
    }

    const createFileUploadHandler = (hasBakedBleed: boolean) => async (
        e: React.ChangeEvent<HTMLInputElement>
    ) => {
        if (e.target.files && e.target.files.length > 0) {
            const fileCount = e.target.files.length;
            const startTime = performance.now();
            console.log(`[Image Upload] Starting upload of ${fileCount} images`);

            setLoadingTask("Processing Images");
            try {
                await addUploadedFiles(e.target.files, { hasBakedBleed });
                const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
                console.log(`[Image Upload] Completed ${fileCount} images in ${elapsed}s`);
            } finally {
                setLoadingTask(null);
            }
        }
    };

    const handleUploadMpcFill = createFileUploadHandler(true);
    const handleUploadStandard = createFileUploadHandler(false);

    return (
        <>
            <div className={`space-y-1 ${mobile ? '' : ''}`}>
                <h6 className="font-medium dark:text-white sr-only">Upload MPC Images</h6>

                <label
                    htmlFor="upload-mpc"
                    className={`inline-block w-full text-center cursor-pointer rounded-md bg-gray-300 dark:bg-gray-600 ${mobile ? 'px-4 py-4 landscape:py-3' : 'px-4 py-3'} text-base font-medium text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-500 active:translate-y-[2px]`}
                >
                    Upload MPC Images
                </label>
                <input
                    id="upload-mpc"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleUploadMpcFill}
                    onClick={(e) => ((e.target as HTMLInputElement).value = "")}
                    className="hidden"
                />
            </div>

            <div className={`space-y-1 ${mobile ? '' : ''}`}>
                <label
                    htmlFor="upload-standard"
                    className={`inline-block w-full text-center cursor-pointer rounded-md bg-gray-300 dark:bg-gray-600 ${mobile ? 'px-4 py-4 landscape:py-3' : 'px-4 py-3'} text-base font-medium text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-500 active:translate-y-[2px]`}
                >
                    Upload Other Images
                </label>
                <input
                    id="upload-standard"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleUploadStandard}
                    onClick={(e) => ((e.target as HTMLInputElement).value = "")}
                    className="hidden"
                />
            </div>
        </>
    );
}
