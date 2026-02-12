import { db, type UserImage } from '../db';


export interface UploadLibraryItem {
    hash: string;
    displayName: string;
    imageUrl: string;
    typeLine?: string;
    canonicalCardName?: string;
    canonicalCardSet?: string;
    canonicalCardNumber?: string;
    isFavorite: boolean;
    createdAt: number;
    hasBuiltInBleed?: boolean;
    tags?: string[];
    linkedFrontHash?: string;
    linkedBackHash?: string;
}

export function getFlexibleCardTypes(typeLine?: string): string[] {
    if (!typeLine) return [];
    const hasDfc = typeLine.includes('//');
    const cleaned = typeLine.replace(/\/\//g, ' ');
    const types = cleaned
        .replace(/[—–-]/g, ' ')
        .split(/\s+/)
        .map(t => t.trim())
        .filter(t => t.length > 0);
    if (hasDfc) types.push('Dual Faced');
    return types;
}

export function getEffectiveCardTypes(item: UploadLibraryItem): string[] {
    const types = getFlexibleCardTypes(item.typeLine);
    if ((item.linkedFrontHash || item.linkedBackHash) && !types.includes('Dual Faced')) {
        types.unshift('Dual Faced');
    }
    return types;
}

const uploadUrlCache = new Map<string, string>();

export function invalidateUploadLibraryUrl(hash: string) {
    const url = uploadUrlCache.get(hash);
    if (url) {
        URL.revokeObjectURL(url);
        uploadUrlCache.delete(hash);
    }
}

export function revokeAllUploadLibraryUrls(): void {
    uploadUrlCache.forEach(url => URL.revokeObjectURL(url));
    uploadUrlCache.clear();
}

export function _resetUploadLibraryState(): void {
    revokeAllUploadLibraryUrls();
}

export async function getUploadLibraryItems(): Promise<UploadLibraryItem[]> {
    const uploads = await db.user_images.toArray();
    return uploads.map(img => {
        let imageUrl = '';
        if (uploadUrlCache.has(img.hash)) {
            imageUrl = uploadUrlCache.get(img.hash)!;
        } else if (img.data) {
            imageUrl = URL.createObjectURL(img.data);
            uploadUrlCache.set(img.hash, imageUrl);
        }
        return {
            hash: img.hash,
            displayName: img.displayName || 'Untitled Upload',
            imageUrl,
            typeLine: img.typeLine,
            canonicalCardName: img.canonicalCardName,
            canonicalCardSet: img.canonicalCardSet,
            canonicalCardNumber: img.canonicalCardNumber,
            isFavorite: img.isFavorite ?? false,
            createdAt: img.createdAt,
            hasBuiltInBleed: img.hasBuiltInBleed,
            tags: img.tags,
            linkedFrontHash: img.linkedFrontHash,
            linkedBackHash: img.linkedBackHash,
        };
    });
}

export async function updateUploadLibraryMetadata(
    hash: string,
    updates: Partial<Pick<UserImage, 'displayName' | 'typeLine' | 'canonicalCardName' | 'canonicalCardSet' | 'canonicalCardNumber' | 'isFavorite' | 'tags' | 'hasBuiltInBleed' | 'linkedFrontHash' | 'linkedBackHash'>>
): Promise<void> {
    await db.user_images.update(hash, updates);
}

export const deleteUploadLibraryItem = async (hash: string): Promise<void> => {
    invalidateUploadLibraryUrl(hash);
    await unlinkUploadFaces(hash);
    await db.transaction('rw', db.user_images, db.images, db.cards, async () => {
        await db.user_images.delete(hash);
        const img = await db.images.get(hash);
        if (img) {
            if (img.refCount <= 1) {
                await db.images.delete(hash);
            } else {
                await db.images.update(hash, { refCount: img.refCount - 1 });
            }
        }
        await db.cards.where('imageId').equals(hash).modify({
            imageId: undefined,
            lookupError: 'Upload image was deleted from library.',
        });
    });
}

export async function bulkDeleteUploadLibraryItems(hashes: string[]): Promise<void> {
    for (const hash of hashes) {
        await deleteUploadLibraryItem(hash);
    }
}

export async function bulkUpdateFavorite(hashes: string[], isFavorite: boolean): Promise<void> {
    await db.transaction('rw', db.user_images, async () => {
        for (const hash of hashes) {
            await db.user_images.update(hash, { isFavorite });
        }
    });
}

export async function linkUploadFaces(frontHash: string, backHash: string): Promise<void> {
    await db.transaction('rw', db.user_images, async () => {
        await db.user_images.update(frontHash, { linkedBackHash: backHash });
        await db.user_images.update(backHash, { linkedFrontHash: frontHash });
    });
}

export async function unlinkUploadFaces(hash: string): Promise<void> {
    await db.transaction('rw', db.user_images, async () => {
        const item = await db.user_images.get(hash);
        if (item?.linkedFrontHash) {
            await db.user_images.update(item.linkedFrontHash, { linkedBackHash: undefined });
        }
        if (item?.linkedBackHash) {
            await db.user_images.update(item.linkedBackHash, { linkedFrontHash: undefined });
        }
        await db.user_images.update(hash, { linkedFrontHash: undefined, linkedBackHash: undefined });
    });
}

export interface UploadLibraryFilterOptions {
    query?: string;
    types?: string[];
    isFavoriteOnly?: boolean;
}

export function filterUploadLibraryItems(
    uploads: UploadLibraryItem[],
    filters: UploadLibraryFilterOptions
): UploadLibraryItem[] {
    let result = uploads;
    if (filters.query) {
        const q = filters.query.toLowerCase();
        result = result.filter(u =>
            u.displayName.toLowerCase().includes(q) ||
            (u.canonicalCardName && u.canonicalCardName.toLowerCase().includes(q))
        );
    }
    if (filters.types && filters.types.length > 0) {
        const typeSet = new Set(filters.types);
        result = result.filter(u => {
            const cardTypes = getEffectiveCardTypes(u);
            return cardTypes.some(t => typeSet.has(t));
        });
    }
    if (filters.isFavoriteOnly) {
        result = result.filter(u => u.isFavorite);
    }
    return result;
}

export type UploadLibrarySortKey = 'name' | 'date' | 'type';

export function sortUploadLibraryItems(
    uploads: UploadLibraryItem[],
    sortBy: UploadLibrarySortKey,
    sortDir: 'asc' | 'desc'
): UploadLibraryItem[] {
    const sorted = [...uploads];
    const dir = sortDir === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
        switch (sortBy) {
            case 'name':
                return dir * a.displayName.localeCompare(b.displayName);
            case 'date':
                return dir * (a.createdAt - b.createdAt);
            case 'type': {
                const aType = getFlexibleCardTypes(a.typeLine)[0] || '';
                const bType = getFlexibleCardTypes(b.typeLine)[0] || '';
                return dir * aType.localeCompare(bType);
            }
            default:
                return 0;
        }
    });
    return sorted;
}

export function getUploadLibraryGroupKey(
    item: UploadLibraryItem,
    sortBy: UploadLibrarySortKey
): string {
    switch (sortBy) {
        case 'name': {
            const first = item.displayName.charAt(0).toUpperCase();
            return /[A-Z]/.test(first) ? first : '#';
        }
        case 'date': {
            const now = Date.now();
            const diff = now - item.createdAt;
            const day = 86400000;
            if (diff < day) return 'Today';
            if (diff < day * 7) return 'This Week';
            if (diff < day * 30) return 'This Month';
            return 'Older';
        }
        case 'type':
            return getFlexibleCardTypes(item.typeLine)[0] || 'Unknown';
    }
}
