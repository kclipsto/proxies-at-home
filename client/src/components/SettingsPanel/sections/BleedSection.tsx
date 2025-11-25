import { useSettingsStore } from "@/store/settings";
import { Checkbox, Label } from "flowbite-react";
import { NumberInput } from "../../NumberInput";
import { useNormalizedInput } from "@/hooks/useInputHooks";
import { useImageProcessing } from "@/hooks/useImageProcessing";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db";
import { useEffect, useRef, useCallback } from "react";

type Props = {
    reprocessSelectedImages: ReturnType<typeof useImageProcessing>["reprocessSelectedImages"];
    cancelProcessing: ReturnType<typeof useImageProcessing>["cancelProcessing"];
};

export function BleedSection({ reprocessSelectedImages, cancelProcessing }: Props) {
    const cards = useLiveQuery(() => db.cards.orderBy("order").toArray(), []) || [];

    const bleedEdgeWidth = useSettingsStore((state) => state.bleedEdgeWidth);
    const bleedEdge = useSettingsStore((state) => state.bleedEdge);
    const darkenNearBlack = useSettingsStore((state) => state.darkenNearBlack);
    const setBleedEdgeWidth = useSettingsStore((state) => state.setBleedEdgeWidth);
    const setBleedEdge = useSettingsStore((state) => state.setBleedEdge);
    const setDarkenNearBlack = useSettingsStore((state) => state.setDarkenNearBlack);

    const cardsRef = useRef(cards);
    cardsRef.current = cards;

    const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const debouncedReprocess = useCallback(
        (newBleedWidth: number, darkenNearBlack: boolean) => {
            if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
            debounceTimeoutRef.current = setTimeout(() => {
                reprocessSelectedImages(cardsRef.current, newBleedWidth, darkenNearBlack);
            }, 500);
        },
        [reprocessSelectedImages]
    );

    useEffect(() => {
        return () => {
            if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
        };
    }, []);

    const bleedEdgeInput = useNormalizedInput(
        bleedEdgeWidth,
        (value) => {
            setBleedEdgeWidth(value);
            debouncedReprocess(value, darkenNearBlack);
        },
        { min: 0, max: 2 }
    );



    return (
        <div className="space-y-4">
            <div>
                <div className="flex justify-between items-center mb-2">
                    <Label>Bleed Edge (mm)</Label>
                    {bleedEdgeInput.warning && (
                        <span className="text-xs text-red-500 animate-pulse">
                            {bleedEdgeInput.warning}
                        </span>
                    )}
                </div>
                <NumberInput
                    ref={bleedEdgeInput.inputRef}
                    className="w-full"
                    step={0.1}
                    defaultValue={bleedEdgeInput.defaultValue}
                    onChange={bleedEdgeInput.handleChange}
                    onBlur={bleedEdgeInput.handleBlur}
                    placeholder={bleedEdgeWidth.toString()}
                    disabled={!bleedEdge}
                />
            </div>

            <div className="flex items-center gap-2">
                <Checkbox
                    id="bleed-edge"
                    checked={bleedEdge}
                    onChange={(e) => {
                        setBleedEdge(e.target.checked);
                        if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
                        if (!e.target.checked) {
                            cancelProcessing();
                        }
                        reprocessSelectedImages(
                            cards,
                            e.target.checked ? bleedEdgeWidth : 0,
                            darkenNearBlack
                        );
                    }}
                />
                <Label htmlFor="bleed-edge">Enable Bleed Edge</Label>
            </div>
            <div className="flex items-center gap-2">
                <Checkbox
                    id="darken-near-black"
                    checked={darkenNearBlack}
                    onChange={(e) => {
                        setDarkenNearBlack(e.target.checked);
                        reprocessSelectedImages(cards, bleedEdge ? bleedEdgeWidth : 0, e.target.checked);
                    }}
                />
                <Label htmlFor="darken-near-black">Darken Near-Black Pixels</Label>
            </div>

        </div>
    );
}
