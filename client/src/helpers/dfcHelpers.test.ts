import { describe, it, expect } from 'vitest';
import {
    isDfc,
    getDfcBackFace,
    getFaceNamesFromPrints,
    computeTabLabels,
    getCurrentCardFace,
    filterPrintsByFace,
    type PrintInfo,
} from './dfcHelpers';
import type { ScryfallCard } from '../../../shared/types';

describe('DFC Helpers', () => {
    describe('isDfc', () => {
        it('should return true for cards with 2+ card_faces', () => {
            const card: ScryfallCard = {
                name: 'Bala Ged Recovery // Bala Ged Sanctuary',
                imageUrls: ['front.png', 'back.png'],
                card_faces: [
                    { name: 'Bala Ged Recovery', imageUrl: 'front.png' },
                    { name: 'Bala Ged Sanctuary', imageUrl: 'back.png' },
                ],
            };
            expect(isDfc(card)).toBe(true);
        });

        it('should return false for cards without card_faces', () => {
            const card: ScryfallCard = {
                name: 'Lightning Bolt',
                imageUrls: ['bolt.png'],
            };
            expect(isDfc(card)).toBe(false);
        });

        it('should return false for cards with only 1 face', () => {
            const card: ScryfallCard = {
                name: 'Some Card',
                imageUrls: ['front.png'],
                card_faces: [
                    { name: 'Some Card', imageUrl: 'front.png' },
                ],
            };
            expect(isDfc(card)).toBe(false);
        });

        it('should return false for undefined card_faces', () => {
            const card: ScryfallCard = {
                name: 'Simple Card',
                imageUrls: ['simple.png'],
                card_faces: undefined,
            };
            expect(isDfc(card)).toBe(false);
        });
    });

    describe('getDfcBackFace', () => {
        it('should return the second face for DFCs', () => {
            const card: ScryfallCard = {
                name: 'Bala Ged Recovery // Bala Ged Sanctuary',
                imageUrls: ['front.png', 'back.png'],
                card_faces: [
                    { name: 'Bala Ged Recovery', imageUrl: 'front.png' },
                    { name: 'Bala Ged Sanctuary', imageUrl: 'back.png' },
                ],
            };
            const back = getDfcBackFace(card);
            expect(back).toBeDefined();
            expect(back?.name).toBe('Bala Ged Sanctuary');
            expect(back?.imageUrl).toBe('back.png');
        });

        it('should return undefined for non-DFCs', () => {
            const card: ScryfallCard = {
                name: 'Lightning Bolt',
                imageUrls: ['bolt.png'],
            };
            expect(getDfcBackFace(card)).toBeUndefined();
        });

        it('should return undefined for single-faced cards', () => {
            const card: ScryfallCard = {
                name: 'Some Card',
                imageUrls: ['front.png'],
                card_faces: [
                    { name: 'Some Card', imageUrl: 'front.png' },
                ],
            };
            expect(getDfcBackFace(card)).toBeUndefined();
        });
    });

    describe('getFaceNamesFromPrints', () => {
        it('should extract unique face names', () => {
            const prints: PrintInfo[] = [
                { imageUrl: 'a.jpg', set: 'ZNR', number: '1', faceName: 'Delver of Secrets' },
                { imageUrl: 'b.jpg', set: 'ISD', number: '1', faceName: 'Delver of Secrets' },
                { imageUrl: 'c.jpg', set: 'ZNR', number: '1b', faceName: 'Insectile Aberration' },
            ];
            expect(getFaceNamesFromPrints(prints)).toEqual(['Delver of Secrets', 'Insectile Aberration']);
        });

        it('should return empty array for undefined prints', () => {
            expect(getFaceNamesFromPrints(undefined)).toEqual([]);
        });

        it('should return empty array for prints without faceNames', () => {
            const prints: PrintInfo[] = [
                { imageUrl: 'a.jpg', set: 'M21', number: '1' },
            ];
            expect(getFaceNamesFromPrints(prints)).toEqual([]);
        });
    });

    describe('computeTabLabels', () => {
        it('should use DFC face names when available', () => {
            const result = computeTabLabels(['Front Face', 'Back Face'], 'Some Card', 'Back');
            expect(result).toEqual({ front: 'Front Face', back: 'Back Face' });
        });

        it('should parse "A // B" format from card name', () => {
            const result = computeTabLabels([], 'Delver of Secrets // Insectile Aberration', undefined);
            expect(result).toEqual({ front: 'Delver of Secrets', back: 'Insectile Aberration' });
        });

        it('should use linked back name as fallback', () => {
            const result = computeTabLabels([], 'Sol Ring', 'MPC Cardback');
            expect(result).toEqual({ front: 'Sol Ring', back: 'MPC Cardback' });
        });

        it('should fall back to defaults', () => {
            const result = computeTabLabels([], '', undefined);
            expect(result).toEqual({ front: 'Front', back: 'Back' });
        });
    });

    describe('getCurrentCardFace', () => {
        it('should return front for non-DFC cards', () => {
            expect(getCurrentCardFace(false, 'Any Name', 'Back Face')).toBe('front');
        });

        it('should return front when card name matches front face', () => {
            expect(getCurrentCardFace(true, 'Delver of Secrets', 'Insectile Aberration')).toBe('front');
        });

        it('should return back when card name matches back face (case insensitive)', () => {
            expect(getCurrentCardFace(true, 'insectile aberration', 'Insectile Aberration')).toBe('back');
        });

        it('should return front for empty card name', () => {
            expect(getCurrentCardFace(true, '', 'Back Face')).toBe('front');
        });
    });

    describe('filterPrintsByFace', () => {
        const prints: PrintInfo[] = [
            { imageUrl: 'a.jpg', set: 'ISD', number: '1', faceName: 'Delver of Secrets' },
            { imageUrl: 'b.jpg', set: 'ISD', number: '1b', faceName: 'Insectile Aberration' },
            { imageUrl: 'c.jpg', set: 'SOI', number: '1', faceName: 'Delver of Secrets' },
        ];

        it('should filter to front face', () => {
            const result = filterPrintsByFace(prints, 'front', 'Delver of Secrets', 'Insectile Aberration');
            expect(result).toHaveLength(2);
            expect(result?.every(p => p.faceName === 'Delver of Secrets')).toBe(true);
        });

        it('should filter to back face', () => {
            const result = filterPrintsByFace(prints, 'back', 'Delver of Secrets', 'Insectile Aberration');
            expect(result).toHaveLength(1);
            expect(result?.[0].faceName).toBe('Insectile Aberration');
        });

        it('should return all prints when no face names provided', () => {
            const result = filterPrintsByFace(prints, 'front', undefined, undefined);
            expect(result).toHaveLength(3);
        });

        it('should return undefined for undefined prints', () => {
            expect(filterPrintsByFace(undefined, 'front', 'A', 'B')).toBeUndefined();
        });
    });
});

