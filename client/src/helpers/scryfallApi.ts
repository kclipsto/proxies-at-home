import axios from 'axios';
import { API_BASE } from '@/constants';
import type { ScryfallCard } from '../../../shared/types';

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
        colors?: string[];
        mana_cost?: string;
        image_uris?: {
            png?: string;
            large?: string;
            normal?: string;
        };
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
    };
}

export async function fetchCardWithPrints(query: string, exact: boolean = false, includePrints: boolean = true): Promise<ScryfallCard | null> {
    try {
        let cardData: ScryfallCard | undefined;
        if (exact) {
            cardData = await getCardByName(query);
        } else {
            const cards = await searchCards(query);
            cardData = cards?.[0];
        }

        if (!cardData) return null;

        if (!includePrints) {
            return cardData;
        }

        // Fetch all prints using SSE stream endpoint
        try {
            const collectedUrls: string[] = [];

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
                            if (data.imageUrls?.[0]) {
                                collectedUrls.push(data.imageUrls[0]);
                            }
                        } catch {
                            // Skip non-JSON lines
                        }
                    }
                }
            }

            return {
                ...cardData,
                imageUrls: collectedUrls.length > 0 ? collectedUrls : cardData.imageUrls,
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


