import axios from 'axios';
import { API_BASE } from '@/constants';
import type { ScryfallCard, PrintInfo } from '../../../shared/types';

function translateAxiosError(error: unknown): string {
    if (axios.isCancel(error)) {
        return 'Request canceled.';
    }
    if (axios.isAxiosError(error)) {
        if (error.response) {
            const status = error.response.status;
            if (status === 404) {
                return "No cards found for your search.";
            }
            if (status >= 500) {
                return "There was a problem with the server. Please try again later.";
            }
        } else if (error.request) {
            return "Could not connect to the server. Please check your internet connection.";
        }
    }
    return "An unexpected error occurred. Please try again.";
}

async function apiCall<T>(request: () => Promise<{ data: T }>): Promise<T> {
    try {
        const response = await request();
        return response.data;
    } catch (error) {
        if (axios.isCancel(error)) {
            throw error;
        }
        throw new Error(translateAxiosError(error));
    }
}

// Route through server proxy for rate limiting and caching
const scryfallApi = axios.create({
    baseURL: `${API_BASE}/api/scryfall`,
});

export interface RawScryfallCard {
    name: string;
    set: string;
    set_name?: string;
    collector_number: string;
    lang: string;
    colors?: string[];
    mana_cost?: string;
    cmc?: number;
    type_line?: string;
    rarity?: string;
    image_uris?: {
        png?: string;
        large?: string;
        normal?: string;
    };
    card_faces?: {
        name?: string; // name is optional in some contexts but usually present
        colors?: string[];
        mana_cost?: string;
        image_uris?: {
            png?: string;
            large?: string;
            normal?: string;
        };
    }[];
    all_parts?: {
        object: string;
        id: string;
        component: string;
        name: string;
        type_line: string;
        uri: string;
    }[];
}

export function getImages(data: RawScryfallCard): string[] {
    const imageUrls: string[] = [];

    if (data.image_uris) {
        if (data.image_uris.png) imageUrls.push(data.image_uris.png);
        else if (data.image_uris.large) imageUrls.push(data.image_uris.large);
        else if (data.image_uris.normal) imageUrls.push(data.image_uris.normal);
    } else if (data.card_faces) {
        data.card_faces.forEach((face: { image_uris?: { png?: string; large?: string; normal?: string } }) => {
            if (face.image_uris) {
                if (face.image_uris.png) imageUrls.push(face.image_uris.png);
                else if (face.image_uris.large) imageUrls.push(face.image_uris.large);
                else if (face.image_uris.normal) imageUrls.push(face.image_uris.normal);
            }
        });
    }
    return imageUrls;
}

function mapScryfallDataToCard(data: RawScryfallCard): ScryfallCard {
    const tokenParts = data.all_parts
        ?.filter(part => part.component === 'token')
        .map(part => ({
            name: part.name,
            id: part.id,
            uri: part.uri,
        }));

    return {
        name: data.name,
        set: data.set,
        number: data.collector_number,
        imageUrls: getImages(data),
        lang: data.lang,
        colors: data.colors || data.card_faces?.[0]?.colors,
        mana_cost: data.mana_cost || data.card_faces?.[0]?.mana_cost,
        cmc: data.cmc,
        type_line: data.type_line,
        rarity: data.rarity,
        card_faces: data.card_faces?.map((face, index) => ({
            name: face.name || (index === 0 ? data.name.split(' // ')[0] : data.name.split(' // ')[1]) || '',
            imageUrl: face.image_uris?.png || face.image_uris?.large || face.image_uris?.normal,
        })),
        token_parts: tokenParts,
        needs_token: !!(tokenParts && tokenParts.length > 0),
    };
}

/**
 * Maps a Scryfall API response containing a data array to ScryfallCard objects.
 * Used by hooks that fetch search results.
 */
export function mapResponseToCards(data: { data?: RawScryfallCard[] }): ScryfallCard[] {
    if (!data.data || data.data.length === 0) return [];
    return data.data.map(mapScryfallDataToCard);
}

export async function fetchCardWithPrints(query: string, exact: boolean = false, includePrints: boolean = true): Promise<ScryfallCard | null> {
    try {
        let cardData: ScryfallCard | undefined;
        if (exact) {
            cardData = await getCardByName(query);
        } else {
            const cards = await searchCards(query);
            // Prioritize exact name match if available (fixes "Sol Ring" resolving to "Solemn Offering")
            const queryLower = query.toLowerCase();
            const exactMatch = cards.find(c => c.name.toLowerCase() === queryLower);
            cardData = exactMatch || cards?.[0];
        }

        if (!cardData) return null;

        if (!includePrints) {
            return cardData;
        }

        // Fetch all prints using SSE stream endpoint
        try {
            const collectedPrints: PrintInfo[] = [];

            const response = await fetch(`${API_BASE}/api/stream/cards`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    cardQueries: [{ name: cardData.name }],
                    cardArt: "prints",
                }),
            });

            if (!response.ok || !response.body) {
                return cardData;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        try {
                            const data = JSON.parse(line.slice(6)) as ScryfallCard;
                            // Collect full print data if available
                            if (data.prints && data.prints.length > 0) {
                                collectedPrints.push(...data.prints);
                            } else if (data.imageUrls?.[0]) {
                                // Fallback: construct print from available fields
                                collectedPrints.push({
                                    imageUrl: data.imageUrls[0],
                                    set: data.set || '',
                                    number: data.number || '',
                                    rarity: data.rarity,
                                });
                            }
                        } catch {
                            // Skip non-JSON lines
                        }
                    }
                }
            }

            return {
                ...cardData,
                imageUrls: collectedPrints.length > 0 ? collectedPrints.map(p => p.imageUrl) : cardData.imageUrls,
                prints: collectedPrints.length > 0 ? collectedPrints : undefined,
            };
        } catch (err) {
            console.error("Failed to fetch prints for card:", err);
            return cardData;
        }
    } catch (e) {
        console.error("Search failed:", e);
        return null;
    }
}

export async function searchCards(query: string, signal?: AbortSignal): Promise<ScryfallCard[]> {
    const data = await apiCall<{ data: RawScryfallCard[] }>(() => scryfallApi.get('/search', {
        params: { q: query },
        signal,
    }));
    return (data.data || []).map(mapScryfallDataToCard);
}

export async function autocomplete(query: string, signal?: AbortSignal): Promise<string[]> {
    const data = await apiCall<{ data: string[] }>(() => scryfallApi.get('/autocomplete', {
        params: { q: query },
        signal,
    }));
    return data.data || [];
}

export async function getCardByName(name: string, signal?: AbortSignal): Promise<ScryfallCard> {
    const data = await apiCall<RawScryfallCard>(() => scryfallApi.get('/named', {
        params: { exact: name },
        signal,
    }));
    return mapScryfallDataToCard(data);
}

export async function fetchCardBySetAndNumber(set: string, number: string, signal?: AbortSignal): Promise<ScryfallCard> {
    const data = await apiCall<RawScryfallCard>(() => scryfallApi.get(`/cards/${set}/${number}`, {
        signal,
    }));
    return mapScryfallDataToCard(data);
}

/**
 * Batch fetch card metadata from the server.
 * Uses the /api/stream/metadata endpoint which returns JSON (not SSE).
 * Much faster than calling fetchCardWithPrints for each card individually.
 */
export async function fetchCardsMetadataBatch(
    cardNames: string[],
    signal?: AbortSignal
): Promise<Map<string, ScryfallCard>> {
    const results = new Map<string, ScryfallCard>();
    if (cardNames.length === 0) return results;

    try {
        const response = await fetch(`${API_BASE}/api/stream/metadata`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cardQueries: cardNames.map(name => ({ name })),
            }),
            signal,
        });

        if (!response.ok) {
            console.error('[fetchCardsMetadataBatch] Server error:', response.status);
            return results;
        }

        const data = await response.json() as {
            results: Array<{ query: { name: string }; card: ScryfallCard | null; error?: string }>;
        };

        for (const item of data.results) {
            if (item.card) {
                // Store by both query name and canonical name for reliable lookup
                results.set(item.query.name.toLowerCase(), item.card);
                if (item.card.name) {
                    results.set(item.card.name.toLowerCase(), item.card);
                }
            }
        }
    } catch (e) {
        console.error('[fetchCardsMetadataBatch] Failed:', e);
    }

    return results;
}
