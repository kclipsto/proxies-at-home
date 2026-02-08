import { useSettingsStore } from "@/store/settings";
import { useUserPreferencesStore } from "@/store/userPreferences";
import { Button, Checkbox, Label, Select } from "flowbite-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { db } from "@/db";
import { cancelAllProcessing } from "@/helpers/cancellationService";
import { LANGUAGE_OPTIONS } from "@/constants";
import { AutoTooltip, ArtSourceToggle, UpdateChannelSelector } from "../../common";
import { HelpCircle, Coffee, Save, RefreshCw } from "lucide-react";
import { useToastStore } from "@/store/toast";

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

    const handleSaveAsDefaults = async () => {
        await useUserPreferencesStore.getState().saveCurrentAsDefaults();
        useToastStore.getState().addToast({
            type: "success",
            message: "Current settings saved as your global defaults",
            dismissible: true,
        });
    };

    const handleResetToDefaults = () => {
        const prefs = useUserPreferencesStore.getState().preferences;
        if (prefs?.settings) {
            // Reset to clean slate first
            useSettingsStore.getState().resetSettings();
            // Then apply user prefs
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            useSettingsStore.getState().setAllSettings(prefs.settings as any);

            useToastStore.getState().addToast({
                type: "success",
                message: "Settings reset to your defaults",
                dismissible: true,
            });
        } else {
            resetSettings();
            useToastStore.getState().addToast({
                type: "success",
                message: "Settings reset to factory defaults",
                dismissible: true,
            });
        }
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

            // Clear all tables except cardbacks (user-uploaded, should be preserved)
            await db.cards.clear();
            await db.images.clear();
            await db.user_images.clear();  // Clear persistent custom uploads
            await db.projects.clear();     // Clear all projects for fresh start
            await db.settings.clear();
            await db.cardMetadataCache.clear();
            await db.mpcSearchCache.clear();
            await db.imageCache.clear();
            await db.scryfallSetsCache.clear();

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
            // Force a hard reload
            window.location.reload();
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

            <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 -ml-2">
                <Checkbox
                    id="auto-import-tokens"
                    checked={useSettingsStore((state) => state.autoImportTokens)}
                    onChange={(e) => useSettingsStore.getState().setAutoImportTokens(e.target.checked)}
                />
                <Label htmlFor="auto-import-tokens" className="flex-1 cursor-pointer">
                    Auto-Import Associated Tokens
                </Label>
                <AutoTooltip content="Automatically fetch associated tokens after importing cards">
                    <HelpCircle className="w-4 h-4 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 cursor-pointer" />
                </AutoTooltip>
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
                <Label className="text-sm text-gray-500 dark:text-gray-400 uppercase font-bold">
                    Defaults & Reset
                </Label>

                <Button
                    fullSized
                    color="blue"
                    onClick={handleSaveAsDefaults}
                >
                    <Save className="w-4 h-4 mr-2" />
                    Save Current as My Defaults
                </Button>

                <Button
                    fullSized
                    onClick={handleResetToDefaults}
                    className="bg-gray-500 dark:bg-gray-600 text-white hover:bg-gray-600 dark:hover:bg-gray-500 border-0"
                >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Reset to My Defaults
                </Button>

                <Button
                    fullSized
                    onClick={resetSettings}
                    className="bg-gray-500 dark:bg-gray-600 text-white hover:bg-gray-600 dark:hover:bg-gray-500 border-0"
                >
                    Restore Factory Settings
                </Button>
            </div>

            <Button color="red" fullSized onClick={handleReset}>
                Reset App Data
            </Button>

            <a
                href="https://buymeacoffee.com/kaiserclipston"
                target="_blank"
                rel="noopener noreferrer"
                className="block"
            >
                <Button
                    fullSized
                    className="bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-500 dark:hover:bg-yellow-600 border-0"
                >
                    <Coffee className="mr-2 h-4 w-4" />
                    Buy Me a Coffee
                </Button>
            </a>

            <Button
                fullSized
                color="blue"
                onClick={() => {
                    // Dispatch custom event to open About modal
                    window.dispatchEvent(new CustomEvent('open-about-modal'));
                }}
            >
                About Proxxied
            </Button>

            {/* Update channel selector - only visible in Electron */}
            <UpdateChannelSelector />

            {
                showResetConfirmModal && createPortal(
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
                )
            }
        </div >
    );
}
