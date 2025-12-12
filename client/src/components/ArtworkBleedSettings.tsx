import { Button, Checkbox, Label } from "flowbite-react";
import { useEffect, useState } from "react";
import { useArtworkModalStore } from "@/store/artworkModal";
import { useSettingsStore } from "@/store/settings";
import { useSelectionStore } from "@/store/selection";
import { undoableUpdateCardBleedSettings } from "@/helpers/undoableActions";
import { BleedModeControl } from "@/components/BleedModeControl";
import { AutoTooltip } from "./AutoTooltip";

export function ArtworkBleedSettings() {
    const modalCard = useArtworkModalStore((state) => state.card);
    const closeModal = useArtworkModalStore((state) => state.closeModal);

    // Get global settings for display labels
    const globalBleedWidth = useSettingsStore((state) => state.bleedEdgeWidth);

    // --- Local State ---
    // 1. Source Bleed
    const globalSourceAmount = useSettingsStore((state) => state.withBleedSourceAmount);
    const [hasBleedBuiltIn, setHasBleedBuiltIn] = useState<boolean>(false);
    const [sourceMode, setSourceMode] = useState<'default' | 'manual'>('default');
    const [providedBleedAmount, setProvidedBleedAmount] = useState<number>(3.175);

    // 2. Target Bleed
    // 'default' = inherit from Type Settings
    // 'manual' = override specific amount
    // 'none' = force 0mm
    const [targetMode, setTargetMode] = useState<'default' | 'manual' | 'none'>('default');
    const [manualTargetAmount, setManualTargetAmount] = useState<number>(3.175);

    // Initialize from card
    useEffect(() => {
        if (modalCard) {
            setHasBleedBuiltIn(modalCard.hasBuiltInBleed ?? (modalCard as { hasBakedBleed?: boolean }).hasBakedBleed ?? false);

            if (modalCard.existingBleedMm !== undefined) {
                setSourceMode('manual');
                setProvidedBleedAmount(modalCard.existingBleedMm);
            } else {
                setSourceMode('default');
                setProvidedBleedAmount(globalSourceAmount);
            }

            // Determine Target Mode state from card props
            if (modalCard.bleedMode === 'none') {
                setTargetMode('none');
            } else if (modalCard.generateBleedMm !== undefined) {
                setTargetMode('manual');
                setManualTargetAmount(modalCard.generateBleedMm);
            } else {
                setTargetMode('default');
                // Default manual amount to global for convenience if they switch
                setManualTargetAmount(globalBleedWidth);
            }
        }
    }, [modalCard, globalBleedWidth, globalSourceAmount]);

    if (!modalCard) return null;

    const handleSave = async () => {
        let bleedMode: 'generate' | 'none' | undefined;
        let existingBleedMm: number | undefined;
        let generateBleedMm: number | undefined;

        // 1. Source Logic
        if (hasBleedBuiltIn) {
            if (sourceMode === 'manual') {
                existingBleedMm = providedBleedAmount;
            } else {
                existingBleedMm = undefined; // Use global default
            }
        } else {
            existingBleedMm = undefined; // No built in bleed -> no existing amount needed
        }

        // 2. Target Logic
        if (targetMode === 'none') {
            bleedMode = 'none';
            generateBleedMm = undefined;
        } else if (targetMode === 'manual') {
            bleedMode = 'generate'; // Force generate mode when manually overriding
            generateBleedMm = manualTargetAmount;
        } else {
            // Default
            bleedMode = undefined; // Let type settings decide
            generateBleedMm = undefined;
        }

        const selectedCards = useSelectionStore.getState().selectedCards;
        const cardUuids = selectedCards.size > 1 && selectedCards.has(modalCard.uuid)
            ? Array.from(selectedCards)
            : [modalCard.uuid];

        await undoableUpdateCardBleedSettings(
            cardUuids,
            {
                hasBuiltInBleed: hasBleedBuiltIn,
                bleedMode,
                existingBleedMm,
                generateBleedMm
            }
        );

        closeModal();
    };

    return (
        <div className="p-4 space-y-4">
            <div>
                <div className="flex items-center gap-2">
                    <h3 className="text-lg font-medium dark:text-white">Bleed Settings</h3>
                    <AutoTooltip
                        content="Configure how bleed edges are handled for this card."
                        className="w-5 h-5 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 cursor-pointer"
                    />
                </div>

                {/* 1. Source Settings */}
                <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="has-bleed-built-in"
                            checked={hasBleedBuiltIn}
                            onChange={(e) => setHasBleedBuiltIn(e.target.checked)}
                            className="mt-0.5"
                        />
                        <div className="flex items-center gap-2 flex-1">
                            <Label htmlFor="has-bleed-built-in" className="cursor-pointer font-medium dark:text-white">
                                Built-in Bleed
                            </Label>
                            <AutoTooltip content="Check this if the image already includes bleed edges (e.g., from MPC Autofill)" />
                        </div>
                    </div>



                    {hasBleedBuiltIn && (
                        <div className="ml-8 mt-2 space-y-2">
                            <BleedModeControl
                                idPrefix="source"
                                groupName="source-mode"
                                mode={sourceMode}
                                onModeChange={setSourceMode}
                                defaultLabel={`Use Type Default (${globalSourceAmount}mm)`}
                                amount={providedBleedAmount}
                                onAmountChange={setProvidedBleedAmount}
                                showNone={false}
                                valueDefault="default"
                            />
                        </div>
                    )}
                </div>

                {/* 2. Target Settings */}
                <div className="space-y-2">
                    <h4 className="font-medium dark:text-white">Bleed Width</h4>
                    <BleedModeControl
                        idPrefix="target"
                        groupName="target-mode"
                        mode={targetMode}
                        onModeChange={setTargetMode}
                        defaultLabel={`Use ${hasBleedBuiltIn ? "Type Default" : "Global Bleed Width"}`}
                        amount={manualTargetAmount}
                        onAmountChange={setManualTargetAmount}
                        valueDefault="default"
                    />
                </div>
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-gray-600">
                <Button color="blue" className="w-full" onClick={handleSave}>
                    Save Settings
                </Button>
            </div>
        </div >
    );
}
