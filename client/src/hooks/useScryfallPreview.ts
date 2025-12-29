import { useState, useRef, useEffect } from "react";
import { extractCardInfo, hasIncompleteTagSyntax } from "@/helpers/cardInfoHelper";
import { getImages, type RawScryfallCard } from "@/helpers/scryfallApi";
import type { ScryfallCard } from "../../../shared/types";

export function useScryfallPreview(query: string) {
    const [setVariations, setSetVariations] = useState<ScryfallCard[]>([]);
    const [validatedPreviewUrl, setValidatedPreviewUrl] = useState<string | null>(null);

    // Cache for preview results to prevent duplicate requests
    const previewCache = useRef<Record<string, string | null>>({});
    const variationsCache = useRef<Record<string, ScryfallCard[]>>({});

    // Validate preview when query changes
    useEffect(() => {
        const validatePreview = async () => {
            // Skip validation if query ends with incomplete tag: syntax (e.g., "set:", "c:", "t:")
            // This prevents 404 errors when user is still typing
            if (hasIncompleteTagSyntax(query)) {
                return;
            }

            const { name: cleanedName, set, number } = extractCardInfo(query);
            const cacheKey = `${cleanedName}|${set}|${number}`;

            if (set) {
                if (number) {
                    // Specific card: Name [Set] {Number}
                    setSetVariations([]); // Clear variations

                    if (previewCache.current[cacheKey] !== undefined) {
                        setValidatedPreviewUrl(previewCache.current[cacheKey]);
                        return;
                    }

                    try {
                        const res = await fetch(`https://api.scryfall.com/cards/${set}/${number}`);
                        if (res.ok) {
                            const data = await res.json();
                            // If name is provided, validate it matches the card at set/number
                            if (cleanedName && !data.name.toLowerCase().includes(cleanedName.toLowerCase())) {
                                previewCache.current[cacheKey] = null;
                                setValidatedPreviewUrl(null);
                            } else {
                                const url = `https://api.scryfall.com/cards/${encodeURIComponent(set)}/${encodeURIComponent(number)}?format=image&version=png`;
                                previewCache.current[cacheKey] = url;
                                setValidatedPreviewUrl(url);
                            }
                        } else {
                            previewCache.current[cacheKey] = null;
                            setValidatedPreviewUrl(null);
                        }
                    } catch {
                        previewCache.current[cacheKey] = null;
                        setValidatedPreviewUrl(null);
                    }
                } else if (cleanedName) {
                    // Set but no number: Name [Set] -> Fetch all variations
                    setValidatedPreviewUrl(null);

                    if (variationsCache.current[cacheKey] !== undefined) {
                        setSetVariations(variationsCache.current[cacheKey]);
                        return;
                    }

                    try {
                        // Fetch all prints for this card in this set
                        const searchUrl = `https://api.scryfall.com/cards/search?q=!"${encodeURIComponent(cleanedName)}"+set:${encodeURIComponent(set)}+unique:prints&order=released`;
                        const res = await fetch(searchUrl);
                        if (res.ok) {
                            const data = await res.json();
                            if (data.data && data.data.length > 0) {
                                const vars = data.data.map((card: RawScryfallCard) => ({
                                    name: card.name,
                                    set: card.set,
                                    setName: card.set_name,
                                    number: card.collector_number,
                                    imageUrls: getImages(card),
                                    // Add other required fields with defaults/nulls as we only need this for display/selection
                                    lang: card.lang,
                                    cmc: card.cmc,
                                    type_line: card.type_line,
                                    rarity: card.rarity,
                                } as ScryfallCard));
                                variationsCache.current[cacheKey] = vars;
                                setSetVariations(vars);
                            } else {
                                variationsCache.current[cacheKey] = [];
                                setSetVariations([]);
                            }
                        } else {
                            variationsCache.current[cacheKey] = [];
                            setSetVariations([]);
                        }
                    } catch {
                        // Ignore errors for variations
                        variationsCache.current[cacheKey] = [];
                        setSetVariations([]);
                    }
                } else {
                    setSetVariations([]);
                    setValidatedPreviewUrl(null);
                }

            } else {
                // No set. Simple query.
                // If it's in suggestions, we assume it's valid (handled by autocomplete).
                // If NOT in suggestions, we need to validate it.
                if (cleanedName && cleanedName.length >= 2) {
                    if (previewCache.current[cacheKey] !== undefined) {
                        setValidatedPreviewUrl(previewCache.current[cacheKey]);
                        setSetVariations([]);
                        return;
                    }

                    try {
                        const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cleanedName)}`);
                        if (res.ok) {
                            const data = await res.json();
                            // If we have a number but no set, we can't really guarantee it matches, 
                            // but at least the name is valid. 
                            // If the user typed "Mountain {273}", cleanedName is "Mountain".
                            // We show the default Mountain.
                            const url = data.image_uris?.png || data.image_uris?.large || data.image_uris?.normal || null;
                            previewCache.current[cacheKey] = url;
                            setValidatedPreviewUrl(url);
                        } else {
                            previewCache.current[cacheKey] = null;
                            setValidatedPreviewUrl(null);
                        }
                    } catch {
                        previewCache.current[cacheKey] = null;
                        setValidatedPreviewUrl(null);
                    }
                } else {
                    setValidatedPreviewUrl(null);
                }
                setSetVariations([]);
            }
        };

        const timeoutId = setTimeout(validatePreview, 500); // Debounce
        return () => clearTimeout(timeoutId);
    }, [query]);

    return { setVariations, validatedPreviewUrl };
}
