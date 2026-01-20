import { describe, it, expect, vi } from 'vitest';
import { parseMpcXml, parseLineToIntent, createIntentFromPreloaded, parseDeckBuilderUrl, parseDeckList } from './importParsers';
import * as moxfieldApi from './moxfieldApi';

describe('importParsers', () => {
    describe('parseLineToIntent', () => {
        it('parses standard line: "4x Sol Ring"', () => {
            const result = parseLineToIntent('4x Sol Ring');
            expect(result).toEqual(expect.objectContaining({
                name: 'Sol Ring',
                quantity: 4,
                isToken: false
            }));
        });

        it('parses set/number: "Sol Ring [LEA] {123}"', () => {
            const result = parseLineToIntent('Sol Ring [LEA] {123}');
            expect(result).toEqual(expect.objectContaining({
                name: 'Sol Ring',
                set: 'lea',
                number: '123'
            }));
        });

        it('parses token syntax: "t:Goblin"', () => {
            const result = parseLineToIntent('t:Goblin');
            expect(result).toEqual(expect.objectContaining({
                name: 'Goblin',
                isToken: true
            }));
        });

        it('parses MPC syntax: "Sol Ring [mpc:12345]"', () => {
            const result = parseLineToIntent('Sol Ring [mpc:12345]');
            expect(result).toEqual(expect.objectContaining({
                name: 'Sol Ring',
                mpcId: '12345',
                sourcePreference: 'mpc'
            }));
        });
    });

    describe('parseMpcXml', () => {
        it('parses valid MPC XML string', () => {
            const xml = `
    <order>
    <fronts>
    <card>
    <id>drive_front_123</id>
    <name>Sol Ring</name>
        <slots>0</slots>
        </card>
        </fronts>
        <backs>
        <card>
        <id>drive_back_456</id>
        <name>Custom Back</name>
            <slots>0</slots>
            </card>
            </backs>
            </order>
                `;
            const intents = parseMpcXml(xml);
            expect(intents).toHaveLength(1);
            expect(intents[0]).toEqual(expect.objectContaining({
                name: 'Sol Ring',
                quantity: 1,
                mpcId: 'drive_front_123',
                linkedBackImageId: 'drive_back_456',
                sourcePreference: 'mpc'
            }));
        });

        it('ignores global cardback (handled by app defaults)', () => {
            const xml = `
            <order>
            <cardback>drive_global_back</cardback>
            <fronts>
            <card>
            <id>drive_front_1</id>
            <name>Card A</name>
                <slots>0</slots>
                </card>
                </fronts>
                <backs> </backs>
                </order>
                    `;
            const intents = parseMpcXml(xml);
            // Global cardbacks should NOT create DFC links
            expect(intents[0].linkedBackImageId).toBeUndefined();
        });
    });

    describe('createIntentFromPreloaded', () => {
        it('creates correct intent from raw object', () => {
            const card = { name: 'Black Lotus', set: 'lea' };
            const intent = createIntentFromPreloaded(card, { quantity: 4 });
            expect(intent).toEqual(expect.objectContaining({
                name: 'Black Lotus',
                quantity: 4,
                isToken: false,
                sourcePreference: 'manual'
            }));
        });
    });

    describe('parseDeckBuilderUrl', () => {
        it('calls Moxfield API for moxfield URLs', async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fetchMock = vi.spyOn(moxfieldApi, 'fetchMoxfieldDeck').mockResolvedValue({ name: 'Test Deck' } as any);
            vi.spyOn(moxfieldApi, 'extractCardsFromDeck').mockReturnValue([
                { name: 'Card A', quantity: 2, set: 'abc', number: '1', scryfallId: '1', category: 'Mainboard' }
            ]);

            const result = await parseDeckBuilderUrl('https://moxfield.com/decks/test');

            expect(fetchMock).toHaveBeenCalled();
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Card A');
            expect(result[0].quantity).toBe(2);
        });
    });

    describe('parseDeckList', () => {
        it('parses multiple lines', () => {
            const deckText = `4 Sol Ring
2 Lightning Bolt
1 Mountain`;
            const result = parseDeckList(deckText);
            expect(result).toHaveLength(3);
            expect(result[0]).toEqual(expect.objectContaining({ name: 'Sol Ring', quantity: 4 }));
            expect(result[1]).toEqual(expect.objectContaining({ name: 'Lightning Bolt', quantity: 2 }));
            expect(result[2]).toEqual(expect.objectContaining({ name: 'Mountain', quantity: 1 }));
        });

        it('skips empty lines', () => {
            const deckText = `4 Sol Ring

2 Lightning Bolt

`;
            const result = parseDeckList(deckText);
            expect(result).toHaveLength(2);
        });

        it('handles CRLF line endings', () => {
            const deckText = "4 Sol Ring\r\n2 Lightning Bolt\r\n";
            const result = parseDeckList(deckText);
            expect(result).toHaveLength(2);
        });

        it('parses deck with set/number annotations', () => {
            const deckText = `4 Sol Ring [2xm] {1}
1 Black Lotus [lea] {232}`;
            const result = parseDeckList(deckText);
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual(expect.objectContaining({
                name: 'Sol Ring',
                quantity: 4,
                set: '2xm',
                number: '1'
            }));
        });

        it('returns empty array for empty input', () => {
            expect(parseDeckList('')).toEqual([]);
            expect(parseDeckList('   \n   \n   ')).toEqual([]);
        });
    });
});
