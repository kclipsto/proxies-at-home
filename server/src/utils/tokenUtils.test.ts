import { describe, it, expect } from 'vitest';
import { extractTokenParts, cardNeedsToken } from './tokenUtils.js';
import type { ScryfallApiCard } from './getCardImagesPaged.js';

describe('tokenUtils', () => {
    describe('extractTokenParts', () => {
        it('should return empty array for null/undefined card', () => {
            expect(extractTokenParts(null)).toEqual([]);
            expect(extractTokenParts(undefined)).toEqual([]);
        });

        it('should return empty array for card without all_parts', () => {
            const card: ScryfallApiCard = {
                name: 'Lightning Bolt',
                set: 'm21',
                collector_number: '199',
            };
            expect(extractTokenParts(card)).toEqual([]);
        });

        it('should extract tokens from all_parts with component "token"', () => {
            const card: ScryfallApiCard = {
                name: 'Marrow-Gnawer',
                set: 'chk',
                collector_number: '124',
                all_parts: [
                    {
                        id: 'card-id-1',
                        component: 'combo_piece',
                        name: 'Marrow-Gnawer',
                        type_line: 'Legendary Creature — Rat Rogue',
                    },
                    {
                        id: 'token-id-1',
                        component: 'token',
                        name: 'Rat',
                        type_line: 'Token Creature — Rat',
                        uri: 'https://api.scryfall.com/cards/tchk/5',
                    },
                ],
            };

            const result = extractTokenParts(card);
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                id: 'token-id-1',
                name: 'Rat',
                type_line: 'Token Creature — Rat',
                uri: 'https://api.scryfall.com/cards/tchk/5',
            });
        });

        it('should extract tokens based on type_line containing "token"', () => {
            const card: ScryfallApiCard = {
                name: 'Test Card',
                all_parts: [
                    {
                        id: 'related-1',
                        component: 'related',
                        name: 'Soldier',
                        type_line: 'Token Creature — Soldier',
                    },
                ],
            };

            const result = extractTokenParts(card);
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Soldier');
        });

        it('should deduplicate tokens by id', () => {
            const card: ScryfallApiCard = {
                name: 'Multi-Token Card',
                all_parts: [
                    { id: 'dup-id', component: 'token', name: 'Token A', type_line: 'Token' },
                    { id: 'dup-id', component: 'token', name: 'Token A', type_line: 'Token' },
                ],
            };

            const result = extractTokenParts(card);
            expect(result).toHaveLength(1);
        });

        it('should deduplicate tokens by name when id is missing', () => {
            const card: ScryfallApiCard = {
                name: 'Multi-Token Card',
                all_parts: [
                    { component: 'token', name: 'Goblin', type_line: 'Token Creature' },
                    { component: 'token', name: 'goblin', type_line: 'Token Creature' },
                ],
            };

            const result = extractTokenParts(card);
            expect(result).toHaveLength(1);
        });

        it('should skip tokens without names', () => {
            const card: ScryfallApiCard = {
                name: 'Test',
                all_parts: [
                    { id: 'id1', component: 'token', name: '', type_line: 'Token' },
                    { id: 'id2', component: 'token', name: 'Valid Token', type_line: 'Token' },
                ],
            };

            const result = extractTokenParts(card);
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Valid Token');
        });
        it('should correctly extract Treasure token from Prosperous Innkeeper', () => {
            const card: ScryfallApiCard = {
                name: 'Prosperous Innkeeper',
                all_parts: [
                    {
                        id: 'e96b3d8c-8d8a-44e9-9150-0648c668612f',
                        component: 'combo_piece',
                        name: 'Prosperous Innkeeper',
                        type_line: 'Creature — Halfling Citizen',
                        uri: 'https://api.scryfall.com/cards/097e4136-3a97-4ce8-af3c-f5b1e9861345'
                    },
                    {
                        id: 'fe717af0-ae82-4467-93be-82305540ba7b',
                        component: 'token',
                        name: 'Treasure',
                        type_line: 'Token Artifact — Treasure',
                        uri: 'https://api.scryfall.com/cards/e6b4c100-348f-4d92-95f7-414f52f40441'
                    }
                ]
            };
            const result = extractTokenParts(card);
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Treasure');
        });
    });

    describe('cardNeedsToken', () => {
        it('should return false for card without tokens', () => {
            const card: ScryfallApiCard = { name: 'No Token Card' };
            expect(cardNeedsToken(card)).toBe(false);
        });

        it('should return true for card with tokens', () => {
            const card: ScryfallApiCard = {
                name: 'Token Generator',
                all_parts: [
                    { id: 't1', component: 'token', name: 'Token', type_line: 'Token Creature' },
                ],
            };
            expect(cardNeedsToken(card)).toBe(true);
        });
    });
});
