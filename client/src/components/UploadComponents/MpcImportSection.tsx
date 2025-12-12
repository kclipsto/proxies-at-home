import React from "react";
import { processMpcImport } from "@/helpers/Mpc";
import { useLoadingStore } from "@/store/loading";
import { useSettingsStore } from "@/store/settings";

type Props = {
    mobile?: boolean;
    onUploadComplete?: () => void;
};

async function readText(file: File): Promise<string> {
    return new Promise((resolve) => {
        const r = new FileReader();
        r.onloadend = () => resolve(String(r.result || ""));
        r.readAsText(file);
    });
}

export function MpcImportSection({ mobile, onUploadComplete }: Props) {
    const setLoadingTask = useLoadingStore((state) => state.setLoadingTask);
    const setLoadingMessage = useLoadingStore((state) => state.setLoadingMessage);

    const handleImportMpcXml = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const startTime = performance.now();
        console.log(`[MPC XML Import] Starting import of ${file.name}`);

        setLoadingTask("Processing Images");
        try {
            const text = await readText(file);

            const result = await processMpcImport(text, (_current, _total, message) => {
                setLoadingTask("Fetching cards");
                setLoadingMessage(message);
            });

            if (result.success) {
                onUploadComplete?.();
            }

            const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

            if (result.success && result.count > 0) {
                console.log(`[MPC XML Import] Completed ${result.count} cards in ${elapsed}s`);
                useSettingsStore.getState().setSortBy("manual");
                onUploadComplete?.();
            } else if (result.error) {
                console.log(`[MPC XML Import] Failed after ${elapsed}s: ${result.error}`);
                alert(result.error);
            } else {
                console.log(`[MPC XML Import] No cards found after ${elapsed}s`);
                alert("No cards found in the file.");
            }
        } catch (err) {
            const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
            console.error(`[MPC XML Import] Error after ${elapsed}s:`, err);
            alert("Failed to parse file.");
        } finally {
            setLoadingTask(null);
            if (e.target) e.target.value = "";
        }
    };

    return (
        <div className={`space-y-1 ${mobile ? '' : ''}`}>
            <label
                htmlFor="import-mpc-xml"
                className={`inline-block w-full text-center cursor-pointer rounded-md bg-gray-300 dark:bg-gray-600 ${mobile ? 'px-4 py-4 landscape:py-3' : 'px-4 py-3'} text-base font-medium text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-500 active:translate-y-[2px]`}
            >
                Import MPC Text (XML)
            </label>
            <input
                id="import-mpc-xml"
                type="file"
                accept=".xml,.txt,.csv,.log,text/xml,text/plain"
                onChange={handleImportMpcXml}
                onClick={(e) => ((e.target as HTMLInputElement).value = "")}
                className="hidden"
            />
        </div>
    );
}
