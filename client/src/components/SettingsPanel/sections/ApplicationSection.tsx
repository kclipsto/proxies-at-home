import { useSettingsStore } from "@/store/settings";
import { Button } from "flowbite-react";
import { ExportActions } from "../../LayoutSettings/ExportActions";
import { useState } from "react";
import { db } from "@/db";

import type { CardOption } from "../../../../../shared/types";

type Props = {
    cards: CardOption[]; // Passed from parent to avoid redundant DB query
};

export function ApplicationSection({ cards }: Props) {
    const resetSettings = useSettingsStore((state) => state.resetSettings);

    const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);

    const handleReset = () => {
        setShowResetConfirmModal(true);
    };

    const confirmReset = async () => {
        setShowResetConfirmModal(false);
        try {
            // Delete the entire database to ensure a full reset
            await db.delete();

            // Re-open the database
            await db.open();

            resetSettings(); // Reset settings store to defaults

            if ("caches" in window) {
                const names = await caches.keys();
                await Promise.all(
                    names
                        .filter((n) => n.startsWith("proxxied-"))
                        .map((n) => caches.delete(n))
                );
            }
        } catch (e) {
            console.error("Error clearing app data:", e);
        } finally {
            window.location.reload();
        }
    };

    return (
        <div className="space-y-4">
            <ExportActions cards={cards} />

            <div className="w-full flex justify-center">
                <span
                    className="text-gray-400 hover:underline cursor-pointer text-sm font-medium"
                    onClick={resetSettings}
                >
                    Reset Settings
                </span>
            </div>

            <div className="w-full flex justify-center">
                <span
                    className="text-red-600 hover:underline cursor-pointer text-sm font-medium"
                    onClick={handleReset}
                >
                    Reset App Data
                </span>
            </div>

            {showResetConfirmModal && (
                <div className="fixed inset-0 z-50 bg-gray-900/50 flex items-center justify-center">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded shadow-md w-96 text-center">
                        <div className="mb-4 text-lg font-semibold text-gray-800 dark:text-white">
                            Confirm Reset App Data
                        </div>
                        <div className="mb-5 text-lg font-normal text-gray-500 dark:text-gray-400">
                            This will clear all saved Proxxied data (cards, cached images,
                            settings) and reload the page. Continue?
                        </div>
                        <div className="flex justify-center gap-4">
                            <Button
                                color="failure"
                                className="bg-red-600 hover:bg-red-700 text-white"
                                onClick={confirmReset}
                            >
                                Yes, I'm sure
                            </Button>
                            <Button
                                color="gray"
                                onClick={() => setShowResetConfirmModal(false)}
                            >
                                No, cancel
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
