import React from "react";
import { processMpcImport } from "@/helpers/mpc";
import { useSettingsStore } from "@/store/settings";
import { FileText } from "lucide-react";

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

    const handleImportMpcXml = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // No loading modal needed - the processing toast shows progress
        try {
            const text = await readText(file);

            const result = await processMpcImport(text);

            if (result.success) {
                onUploadComplete?.();
            }

            if (result.success && result.count > 0) {
                useSettingsStore.getState().setSortBy("manual");
                onUploadComplete?.();
            } else if (result.error) {
                alert(result.error);
            } else {
                alert("No cards found in the file.");
            }
        } catch {
            alert("Failed to parse file.");
        } finally {
            if (e.target) e.target.value = "";
        }
    };

    return (
        <div className={`space-y-1 ${mobile ? '' : ''}`}>
            <label
                htmlFor="import-mpc-xml"
                className={`relative flex items-center justify-center w-full cursor-pointer rounded-md bg-gray-300 dark:bg-gray-600 ${mobile ? 'px-4 py-4 landscape:py-3' : 'px-4 py-3'} text-base font-medium text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-500 active:translate-y-[2px]`}
            >
                <FileText className="absolute left-4 w-5 h-5" />
                Import MPC XML
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
