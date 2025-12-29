import { useSettingsStore } from "@/store/settings";
import { Button, Checkbox, Label, Select } from "flowbite-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { db } from "@/db";
import { cancelAllProcessing } from "@/helpers/cancellationService";
import { LANGUAGE_OPTIONS } from "@/constants";
import { AutoTooltip, ArtSourceToggle } from "../../common";
import { HelpCircle } from "lucide-react";

export function ApplicationSection() {
    const resetSettings = useSettingsStore((state) => state.resetSettings);
    const showProcessingToasts = useSettingsStore((state) => state.showProcessingToasts);
    const setShowProcessingToasts = useSettingsStore((state) => state.setShowProcessingToasts);
    const preferredArtSource = useSettingsStore((state) => state.preferredArtSource);
    const setPreferredArtSource = useSettingsStore((state) => state.setPreferredArtSource);
    const globalLanguage = useSettingsStore((state) => state.globalLanguage);
    const setGlobalLanguage = useSettingsStore((state) => state.setGlobalLanguage);

    const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);

    const handleReset = () => {
        setShowResetConfirmModal(true);
    };

    const confirmReset = async () => {
        setShowResetConfirmModal(false);

        try {
            // Cancel all processing before reset
            cancelAllProcessing();

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
            // Clear MPC search cache separately (Dexie transaction limit)
            await db.mpcSearchCache.clear();

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
            <div>
                <div className="mb-2 block">
                    <Label>Preferred Art Source</Label>
                </div>
                <ArtSourceToggle
                    value={preferredArtSource}
                    onChange={setPreferredArtSource}
                />
            </div>

            <div>
                <div className="mb-2 flex items-center justify-between">
                    <Label>Card Language</Label>
                    <AutoTooltip content="Used for Scryfall lookups">
                        <HelpCircle className="w-4 h-4 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 cursor-pointer" />
                    </AutoTooltip>
                </div>
                <Select
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

            <a
                href="https://buymeacoffee.com/kaiserclipston"
                target="_blank"
                rel="noopener noreferrer"
            >
                <Button className="bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-500 dark:hover:bg-yellow-600 w-full">
                    Buy Me a Coffee
                </Button>
            </a>

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
                <div className="fixed inset-0 z-100 bg-gray-900/50 flex items-center justify-center">
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
