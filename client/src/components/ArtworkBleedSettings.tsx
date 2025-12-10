import { Button, Select } from "flowbite-react";
import { useEffect, useState } from "react";
import { useArtworkModalStore } from "@/store/artworkModal";
import { useSettingsStore } from "@/store";
import { useSelectionStore } from "@/store/selection";
import { undoableUpdateCardBleedSettings } from "@/helpers/undoableActions";
import { db } from "../db";
import { NumberInput } from "./NumberInput";

export function ArtworkBleedSettings() {
    const modalCard = useArtworkModalStore((state) => state.card);
    const closeModal = useArtworkModalStore((state) => state.closeModal);

    // Get global bleed settings for display
    const globalBleedWidth = useSettingsStore((state) => state.bleedEdgeWidth);
    const globalBleedUnit = useSettingsStore((state) => state.bleedEdgeUnit);

    // Per-card bleed settings state
    const [cardBleedMode, setCardBleedMode] = useState<'default' | 'generate' | 'existing' | 'none'>('default');
    const [cardExistingBleed, setCardExistingBleed] = useState<number>(0);
    const [cardExistingBleedUnit, setCardExistingBleedUnit] = useState<'mm' | 'in'>('mm');
    const [cardGenerateBleed, setCardGenerateBleed] = useState<number>(1);
    const [cardGenerateBleedUnit, setCardGenerateBleedUnit] = useState<'mm' | 'in'>('mm');
    const [useGlobalBleed, setUseGlobalBleed] = useState<boolean>(true); // When generate mode, use global or custom

    // Initialize per-card bleed settings from card when component mounts
    useEffect(() => {
        if (modalCard) {
            setCardBleedMode(modalCard.bleedMode ?? 'default');
            setCardExistingBleed(modalCard.existingBleedMm ?? 0);
            // Initialize generate bleed settings
            if (modalCard.generateBleedMm !== undefined) {
                setUseGlobalBleed(false);
                setCardGenerateBleed(modalCard.generateBleedMm);
            } else {
                setUseGlobalBleed(true);
            }
        }
    }, [modalCard]);

    if (!modalCard) return null;

    return (
        <div className="p-6 space-y-6">
            <div>
                <h3 className="text-lg font-medium mb-4 dark:text-white">Bleed Settings</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Override the global bleed settings for this card.
                </p>

                <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="radio"
                            name="card-bleed-mode"
                            checked={cardBleedMode === 'default'}
                            onChange={() => setCardBleedMode('default')}
                            className="text-blue-600"
                        />
                        <span className="dark:text-gray-300">Use Default (from global settings)</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="radio"
                            name="card-bleed-mode"
                            checked={cardBleedMode === 'generate'}
                            onChange={() => setCardBleedMode('generate')}
                            className="text-blue-600"
                        />
                        <span className="dark:text-gray-300">Generate Bleed</span>
                    </label>

                    {/* Sub-options for Generate Bleed */}
                    {cardBleedMode === 'generate' && (
                        <div className="ml-7 pl-4 border-l-2 border-gray-200 dark:border-gray-600 space-y-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="generate-bleed-source"
                                    checked={useGlobalBleed}
                                    onChange={() => setUseGlobalBleed(true)}
                                    className="text-blue-600"
                                />
                                <span className="text-sm dark:text-gray-300">
                                    Use Global ({globalBleedWidth} {globalBleedUnit})
                                </span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="generate-bleed-source"
                                    checked={!useGlobalBleed}
                                    onChange={() => setUseGlobalBleed(false)}
                                    className="text-blue-600"
                                />
                                <span className="text-sm dark:text-gray-300">Use Custom</span>
                            </label>
                            {!useGlobalBleed && (
                                <div className="flex items-center gap-2 mt-2">
                                    <NumberInput
                                        className="w-20"
                                        step={0.1}
                                        min={0}
                                        disabled={false}
                                        value={cardGenerateBleed}
                                        onChange={(e) => setCardGenerateBleed(Math.max(0, parseFloat(e.target.value) || 0))}
                                    />
                                    <Select
                                        sizing="md"
                                        value={cardGenerateBleedUnit}
                                        onChange={(e) => {
                                            const newUnit = e.target.value as 'mm' | 'in';
                                            if (newUnit !== cardGenerateBleedUnit) {
                                                // Convert value when switching units
                                                const converted = newUnit === 'in'
                                                    ? cardGenerateBleed / 25.4
                                                    : cardGenerateBleed * 25.4;
                                                setCardGenerateBleed(Math.round(converted * 1000) / 1000);
                                            }
                                            setCardGenerateBleedUnit(newUnit);
                                        }}
                                        className="w-16"
                                    >
                                        <option value="mm">mm</option>
                                        <option value="in">in</option>
                                    </Select>
                                </div>
                            )}
                        </div>
                    )}

                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="radio"
                            name="card-bleed-mode"
                            checked={cardBleedMode === 'existing'}
                            onChange={() => setCardBleedMode('existing')}
                            className="text-blue-600"
                        />
                        <span className="dark:text-gray-300">Use Existing Bleed</span>
                    </label>

                    {/* Sub-options for Existing Bleed */}
                    {cardBleedMode === 'existing' && (
                        <div className="ml-7 pl-4 border-l-2 border-gray-200 dark:border-gray-600">
                            <div className="flex items-center gap-2">
                                <span className="text-sm dark:text-gray-300">Amount:</span>
                                <NumberInput
                                    className="w-20"
                                    step={0.1}
                                    min={0}
                                    value={cardExistingBleed}
                                    onChange={(e) => setCardExistingBleed(Math.max(0, parseFloat(e.target.value) || 0))}
                                />
                                <Select
                                    sizing="md"
                                    value={cardExistingBleedUnit}
                                    onChange={(e) => {
                                        const newUnit = e.target.value as 'mm' | 'in';
                                        if (newUnit !== cardExistingBleedUnit) {
                                            // Convert value when switching units
                                            const converted = newUnit === 'in'
                                                ? cardExistingBleed / 25.4
                                                : cardExistingBleed * 25.4;
                                            setCardExistingBleed(Math.round(converted * 1000) / 1000);
                                        }
                                        setCardExistingBleedUnit(newUnit);
                                    }}
                                    className="w-16"
                                >
                                    <option value="mm">mm</option>
                                    <option value="in">in</option>
                                </Select>
                            </div>
                        </div>
                    )}

                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="radio"
                            name="card-bleed-mode"
                            checked={cardBleedMode === 'none'}
                            onChange={() => setCardBleedMode('none')}
                            className="text-blue-600"
                        />
                        <span className="dark:text-gray-300">No Bleed</span>
                    </label>
                </div>
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-gray-600">
                <Button
                    color="blue"
                    className="w-full"
                    onClick={async () => {
                        const bleedMode = cardBleedMode === 'default' ? undefined : cardBleedMode;
                        const existingBleedMm = cardBleedMode === 'existing'
                            ? (cardExistingBleedUnit === 'in' ? cardExistingBleed * 25.4 : cardExistingBleed)
                            : undefined;
                        // For generate mode: custom value in mm, or undefined to use global
                        const generateBleedMm = (cardBleedMode === 'generate' && !useGlobalBleed)
                            ? (cardGenerateBleedUnit === 'in' ? cardGenerateBleed * 25.4 : cardGenerateBleed)
                            : undefined;

                        // Get all selected cards - if multiple are selected, apply to all
                        const selectedCards = useSelectionStore.getState().selectedCards;
                        const cardUuids = selectedCards.size > 1 && selectedCards.has(modalCard.uuid)
                            ? Array.from(selectedCards)
                            : [modalCard.uuid];

                        // Update all selected cards' bleed settings (with undo support)
                        await undoableUpdateCardBleedSettings(cardUuids, {
                            bleedMode,
                            existingBleedMm,
                            generateBleedMm,
                        });

                        // Get imageIds for all affected cards and invalidate their blobs
                        const affectedCards = await db.cards.where('uuid').anyOf(cardUuids).toArray();
                        const imageIds = affectedCards
                            .map(c => c.imageId)
                            .filter((id): id is string => !!id);

                        for (const imageId of imageIds) {
                            await db.images.update(imageId, {
                                displayBlob: undefined,
                                exportBlob: undefined,
                                displayBlobDarkened: undefined,
                                exportBlobDarkened: undefined,
                            });
                        }

                        closeModal();
                    }}
                >
                    Save Settings
                </Button>
            </div>
        </div>
    );
}
