import { useSettingsStore } from "@/store/settings";
import { Button, Checkbox, Label, Radio } from "flowbite-react";
import { ExportActions } from "../../LayoutSettings/ExportActions";
import { useState } from "react";
import { createPortal } from "react-dom";
import { db } from "@/db";
import { cancelAllProcessing } from "@/helpers/cancellationService";

import type { CardOption } from "../../../../../shared/types";

type Props = {
    cards: CardOption[]; // Passed from parent to avoid redundant DB query
};

export function ApplicationSection({ cards }: Props) {
    const resetSettings = useSettingsStore((state) => state.resetSettings);
    const showProcessingToasts = useSettingsStore((state) => state.showProcessingToasts);
    const setShowProcessingToasts = useSettingsStore((state) => state.setShowProcessingToasts);
    const decklistSortAlpha = useSettingsStore((state) => state.decklistSortAlpha);
    const setDecklistSortAlpha = useSettingsStore((state) => state.setDecklistSortAlpha);

    const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);

    const handleReset = () => {
        setShowResetConfirmModal(true);
    };

    const confirmReset = async () => {
        setShowResetConfirmModal(false);

        // Cancel all processing before reset
        cancelAllProcessing();

        try {
            // Unregister service workers first
            if ("serviceWorker" in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (const registration of registrations) {
                    await registration.unregister();
                }
            }

            // Clear individual tables but preserve cardbacks and imageCache
            await db.transaction("rw", db.cards, db.images, db.settings, db.cardMetadataCache, async () => {
                await db.cards.clear();
                await db.images.clear();
                await db.settings.clear();
                await db.cardMetadataCache.clear();
                // Note: cardbacks and imageCache are intentionally NOT cleared
            });

            // Clear localStorage preferences that should reset with app data
            localStorage.removeItem("cardback-delete-confirm-disabled");

            resetSettings(); // Reset settings store to defaults

            if ("caches" in window) {
                const names = await caches.keys();
                await Promise.all(names.map((n) => caches.delete(n)));
            }
        } catch (e) {
            console.error("Error clearing app data:", e);
        } finally {
            // Force a hard reload from the server
            window.location.href = window.location.origin;
        }
    };

    return (
        <div className="space-y-4">
            <ExportActions cards={cards} />

            <div>
                <div className="mb-2 block">
                    <Label>Copy Decklist Order</Label>
                </div>
                <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <Radio
                            name="decklistOrder"
                            value="displayed"
                            checked={!decklistSortAlpha}
                            onChange={() => setDecklistSortAlpha(false)}
                        />
                        <span className={`text-sm ${!decklistSortAlpha ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>As Displayed</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <Radio
                            name="decklistOrder"
                            value="alpha"
                            checked={decklistSortAlpha}
                            onChange={() => setDecklistSortAlpha(true)}
                        />
                        <span className={`text-sm ${decklistSortAlpha ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>Alphabetical</span>
                    </label>
                </div>
            </div>

            <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 -ml-2">
                <Checkbox
                    id="show-processing-toasts"
                    checked={showProcessingToasts}
                    onChange={(e) => setShowProcessingToasts(e.target.checked)}
                />
                <Label htmlFor="show-processing-toasts" className="flex-1 cursor-pointer">
                    Show Processing Notifications
                </Label>
            </div>

            <div className="w-full flex justify-center">
                <Button color="gray" fullSized onClick={resetSettings}>
                    Reset Settings
                </Button>
            </div>

            <div className="w-full flex justify-center">
                <Button color="red" fullSized onClick={handleReset}>
                    Reset App Data
                </Button>
            </div>

            <div className="mt-auto space-y-3 pt-4">
                <a
                    href="https://github.com/kclipsto/proxies-at-home"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-md underline text-center text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
                >
                    Code by Kaiser Clipston (Github)
                </a>
            </div>

            {showResetConfirmModal && createPortal(
                <div className="fixed inset-0 z-[100] bg-gray-900/50 flex items-center justify-center">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded shadow-md w-96 text-center">
                        <div className="mb-4 text-lg font-semibold text-gray-800 dark:text-white">
                            Confirm Reset App Data
                        </div>
                        <div className="mb-5 text-lg font-normal text-gray-500 dark:text-gray-400">
                            This will clear all saved Proxxied data (cards, settings)
                            and reload the page. Image cache will be preserved. Continue?
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
                </div>,
                document.body
            )}
        </div>
    );
}
