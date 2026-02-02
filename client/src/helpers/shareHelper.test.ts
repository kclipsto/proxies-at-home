import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    serializeCards,
    serializeSettings,
    getShareWarnings,
    deserializeForImport,
    type ShareData,
} from './shareHelper';
import type { CardOption } from '@/types';

// Mock dependencies
vi.mock('./mpcAutofillApi', () => ({
    extractMpcIdentifierFromImageId: vi.fn((id: string | undefined) => {
        if (!id) return null;
        if (id.startsWith('mpc_')) return id.replace('mpc_', '');
        if (id.includes('/api/cards/images/mpc?id=')) {
            const match = id.match(/id=([^&]+)/);
            return match ? match[1] : null;
        }
        return null;
    }),
}));

vi.mock('./imageSourceUtils', () => ({
    inferImageSource: vi.fn((id: string | undefined) => {
        if (!id) return 'unknown';
        if (id.startsWith('mpc_')) return 'mpc';
        if (id.includes('scryfall')) return 'scryfall';
        if (id.startsWith('local_')) return 'custom';
        return 'unknown';
    }),
}));

describe('shareHelper', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('serializeCards', () => {
        it('should serialize Scryfall cards correctly', () => {
            const cards: CardOption[] = [
                {
                    uuid: 'card-1',
                    name: 'Lightning Bolt',
                    order: 0,
                    set: 'lea',
                    number: '161',
                    imageId: 'scryfall/lea/161',
                    isUserUpload: false,
                },
            ];

            const result = serializeCards(cards);

            expect(result.shareCards).toHaveLength(1);
            expect(result.shareCards[0][0]).toBe('s'); // type
            expect(result.shareCards[0][1]).toBe('lea/161'); // set/number
            expect(result.shareCards[0][2]).toBe(0); // order
            expect(result.skipped).toBe(0);
        });

        it('should serialize MPC cards correctly', () => {
            const cards: CardOption[] = [
                {
                    uuid: 'card-1',
                    name: 'Lightning Bolt',
                    order: 0,
                    imageId: 'mpc_abc123xyz',
                    isUserUpload: false,
                },
            ];

            const result = serializeCards(cards);

            expect(result.shareCards).toHaveLength(1);
            expect(result.shareCards[0][0]).toBe('m'); // type
            expect(result.shareCards[0][1]).toBe('abc123xyz'); // MPC ID
            expect(result.shareCards[0][2]).toBe(0); // order
        });

        it('should skip custom upload cards', () => {
            const cards: CardOption[] = [
                {
                    uuid: 'card-1',
                    name: 'Custom Card',
                    order: 0,
                    imageId: 'local_custom123',
                    isUserUpload: true,
                },
            ];

            const result = serializeCards(cards);

            expect(result.shareCards).toHaveLength(0);
            expect(result.skipped).toBe(1);
        });

        it('should include category when present', () => {
            const cards: CardOption[] = [
                {
                    uuid: 'card-1',
                    name: 'Sol Ring',
                    order: 0,
                    set: 'cmd',
                    number: '235',
                    imageId: 'scryfall/cmd/235',
                    isUserUpload: false,
                    category: 'Commander',
                },
            ];

            const result = serializeCards(cards);

            expect(result.shareCards[0][3]).toBe('Commander');
        });

        it('should compress overrides with short keys', () => {
            const cards: CardOption[] = [
                {
                    uuid: 'card-1',
                    name: 'Sol Ring',
                    order: 0,
                    set: 'cmd',
                    number: '235',
                    imageId: 'scryfall/cmd/235',
                    isUserUpload: false,
                    overrides: {
                        brightness: 10,
                        contrast: 1.2,
                        saturation: 0.9,
                    },
                },
            ];

            const result = serializeCards(cards);

            const overrides = result.shareCards[0][4] as Record<string, unknown>;
            expect(overrides).not.toBeNull();
            expect(overrides.br).toBe(10); // brightness -> br
            expect(overrides.ct).toBe(1.2); // contrast -> ct
            expect(overrides.sa).toBe(0.9); // saturation -> sa
        });

        it('should skip linked back cards (DFC backs)', () => {
            const cards: CardOption[] = [
                {
                    uuid: 'front',
                    name: 'Delver of Secrets',
                    order: 0,
                    set: 'isd',
                    number: '51',
                    imageId: 'scryfall/isd/51',
                    isUserUpload: false,
                    linkedBackId: 'back',
                },
                {
                    uuid: 'back',
                    name: 'Insectile Aberration',
                    order: 1,
                    set: 'isd',
                    number: '51b',
                    imageId: 'scryfall/isd/51b',
                    isUserUpload: false,
                    linkedFrontId: 'front',
                },
            ];

            const result = serializeCards(cards);

            // Should serialize front and back with DFC link
            // The back card should be added to the array for the DFC link
            expect(result.dfc).toHaveLength(1);
        });
    });

    describe('serializeSettings', () => {
        it('should use short keys for settings', () => {
            const settings = {
                pageSizePreset: 'Letter',
                columns: 3,
                rows: 3,
                bleedEdge: true,
                bleedEdgeWidth: 3.175,
                darkenMode: 'contrast-edges',
                perCardGuideStyle: 'corners',
                guideColor: '#39FF14',
                dpi: 600,
            };

            const result = serializeSettings(settings);

            expect(result.pr).toBe('Letter');
            expect(result.c).toBe(3);
            expect(result.r).toBe(3);
            expect(result.bl).toBe(true);
            expect(result.blMm).toBe(3.175);
            expect(result.dk).toBe('contrast-edges');
            expect(result.gs).toBe('corners');
            expect(result.gc).toBe('#39FF14');
            expect(result.dpi).toBe(600);
        });

        it('should serialize user preference settings', () => {
            const settings = {
                autoImportTokens: true,
                preferredArtSource: 'mpc',
                globalLanguage: 'fr',
                mpcFuzzySearch: false,
            };

            const result = serializeSettings(settings);

            expect(result.ait).toBe(true);
            expect(result.pas).toBe('mpc');
            expect(result.gl).toBe('fr');
            expect(result.mfs).toBe(false);
        });
    });

    describe('getShareWarnings', () => {
        it('should return empty array when no custom uploads', () => {
            const cards: CardOption[] = [
                {
                    uuid: 'card-1',
                    name: 'Sol Ring',
                    order: 0,
                    set: 'cmd',
                    number: '235',
                    imageId: 'scryfall/cmd/235',
                    isUserUpload: false,
                },
            ];

            const warnings = getShareWarnings(cards);

            expect(warnings).toHaveLength(0);
        });

        it('should warn about custom uploads', () => {
            const cards: CardOption[] = [
                {
                    uuid: 'card-1',
                    name: 'Custom Card',
                    order: 0,
                    imageId: 'local_custom123',
                    isUserUpload: true,
                },
                {
                    uuid: 'card-2',
                    name: 'Another Custom',
                    order: 1,
                    imageId: 'local_custom456',
                    isUserUpload: true,
                },
            ];

            const warnings = getShareWarnings(cards);

            expect(warnings).toHaveLength(1);
            expect(warnings[0]).toContain('2 custom uploads');
        });

        it('should use singular form for one custom upload', () => {
            const cards: CardOption[] = [
                {
                    uuid: 'card-1',
                    name: 'Custom Card',
                    order: 0,
                    imageId: 'local_custom123',
                    isUserUpload: true,
                },
            ];

            const warnings = getShareWarnings(cards);

            expect(warnings[0]).toContain('1 custom upload will');
        });
    });

    describe('deserializeForImport', () => {
        it('should deserialize Scryfall cards with set/number', () => {
            const data: ShareData = {
                v: 1,
                c: [
                    ['s', 'lea/161', 0, null, null],
                    ['s', 'cmd/235', 1, 'Commander', null],
                ],
            };

            const result = deserializeForImport(data);

            expect(result.cards).toHaveLength(2);
            expect(result.cards[0].set).toBe('lea');
            expect(result.cards[0].number).toBe('161');
            expect(result.cards[1].category).toBe('Commander');
        });

        it('should deserialize MPC cards with mpcIdentifier', () => {
            const data: ShareData = {
                v: 1,
                c: [
                    ['m', 'abc123xyz', 0, null, null],
                ],
            };

            const result = deserializeForImport(data);

            expect(result.cards).toHaveLength(1);
            expect(result.cards[0].mpcIdentifier).toBe('abc123xyz');
        });

        it('should expand override short keys', () => {
            const data: ShareData = {
                v: 1,
                c: [
                    ['s', 'lea/161', 0, null, { br: 10, ct: 1.2 }],
                ],
            };

            const result = deserializeForImport(data);

            expect(result.cards[0].overrides?.brightness).toBe(10);
            expect(result.cards[0].overrides?.contrast).toBe(1.2);
        });

        it('should include DFC links', () => {
            const data: ShareData = {
                v: 1,
                c: [
                    ['s', 'isd/51', 0, null, null],
                    ['s', 'isd/51b', 1, null, null],
                ],
                dfc: [[0, 1]],
            };

            const result = deserializeForImport(data);

            expect(result.dfcLinks).toEqual([[0, 1]]);
        });

        it('should deserialize imageId and order', () => {
            const data: ShareData = {
                v: 1,
                c: [[
                    's',
                    'sol/1',
                    54321,
                    null,
                    null,
                    'Sol Ring',
                    'https://example.com/image.jpg'
                ]]
            };

            const result = deserializeForImport(data);
            expect(result.cards[0].order).toBe(54321);
            expect(result.cards[0].imageId).toBe('https://example.com/image.jpg');
        });
        it('should include settings', () => {
            const data: ShareData = {
                v: 1,
                c: [],
                st: { pr: 'A4', c: 3, r: 3 },
            };

            const result = deserializeForImport(data);

            expect(result.settings?.pr).toBe('A4');
            expect(result.settings?.c).toBe(3);
        });
    });
});
