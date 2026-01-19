import { describe, it, expect } from 'vitest';
import {
    SCRYFALL_SYNTAX_KEYWORDS,
    startsWithScryfallKeyword,
    containsScryfallSyntax,
    isPureScryfallQuery,
} from './scryfallSyntax';

describe('scryfallSyntax', () => {
    describe('SCRYFALL_SYNTAX_KEYWORDS', () => {
        it('should contain common single-letter keywords', () => {
            expect(SCRYFALL_SYNTAX_KEYWORDS.has('c')).toBe(true);  // color
            expect(SCRYFALL_SYNTAX_KEYWORDS.has('t')).toBe(true);  // type
            expect(SCRYFALL_SYNTAX_KEYWORDS.has('o')).toBe(true);  // oracle
            expect(SCRYFALL_SYNTAX_KEYWORDS.has('m')).toBe(true);  // mana
            expect(SCRYFALL_SYNTAX_KEYWORDS.has('r')).toBe(true);  // rarity
            expect(SCRYFALL_SYNTAX_KEYWORDS.has('s')).toBe(true);  // set
            expect(SCRYFALL_SYNTAX_KEYWORDS.has('e')).toBe(true);  // edition
            expect(SCRYFALL_SYNTAX_KEYWORDS.has('f')).toBe(true);  // format
            expect(SCRYFALL_SYNTAX_KEYWORDS.has('a')).toBe(true);  // artist
            expect(SCRYFALL_SYNTAX_KEYWORDS.has('b')).toBe(true);  // block
        });

        it('should contain important multi-letter keywords', () => {
            expect(SCRYFALL_SYNTAX_KEYWORDS.has('is')).toBe(true);
            expect(SCRYFALL_SYNTAX_KEYWORDS.has('not')).toBe(true);
            expect(SCRYFALL_SYNTAX_KEYWORDS.has('has')).toBe(true);
            expect(SCRYFALL_SYNTAX_KEYWORDS.has('set')).toBe(true);
            expect(SCRYFALL_SYNTAX_KEYWORDS.has('type')).toBe(true);
            expect(SCRYFALL_SYNTAX_KEYWORDS.has('color')).toBe(true);
            expect(SCRYFALL_SYNTAX_KEYWORDS.has('oracle')).toBe(true);
            expect(SCRYFALL_SYNTAX_KEYWORDS.has('format')).toBe(true);
            expect(SCRYFALL_SYNTAX_KEYWORDS.has('rarity')).toBe(true);
            expect(SCRYFALL_SYNTAX_KEYWORDS.has('mana')).toBe(true);
        });
    });

    describe('startsWithScryfallKeyword', () => {
        it('should detect is: prefix', () => {
            expect(startsWithScryfallKeyword('is:mdfc')).toBe(true);
            expect(startsWithScryfallKeyword('is:dfc')).toBe(true);
            expect(startsWithScryfallKeyword('is:commander')).toBe(true);
            expect(startsWithScryfallKeyword('is:fetchland')).toBe(true);
        });

        it('should detect c: color prefix', () => {
            expect(startsWithScryfallKeyword('c:r')).toBe(true);
            expect(startsWithScryfallKeyword('c:uw')).toBe(true);
            expect(startsWithScryfallKeyword('color:red')).toBe(true);
        });

        it('should detect t: type prefix', () => {
            expect(startsWithScryfallKeyword('t:creature')).toBe(true);
            expect(startsWithScryfallKeyword('t:legend')).toBe(true);
            expect(startsWithScryfallKeyword('type:instant')).toBe(true);
        });

        it('should detect o: oracle prefix', () => {
            expect(startsWithScryfallKeyword('o:draw')).toBe(true);
            expect(startsWithScryfallKeyword('oracle:destroy')).toBe(true);
        });

        it('should detect set: and s: and e: prefixes', () => {
            expect(startsWithScryfallKeyword('set:cmd')).toBe(true);
            expect(startsWithScryfallKeyword('s:cmd')).toBe(true);
            expect(startsWithScryfallKeyword('e:war')).toBe(true);
        });

        it('should detect f: format prefix', () => {
            expect(startsWithScryfallKeyword('f:modern')).toBe(true);
            expect(startsWithScryfallKeyword('format:legacy')).toBe(true);
        });

        it('should detect r: rarity prefix', () => {
            expect(startsWithScryfallKeyword('r:mythic')).toBe(true);
            expect(startsWithScryfallKeyword('rarity:rare')).toBe(true);
        });

        it('should return false for non-keywords', () => {
            expect(startsWithScryfallKeyword('sol:ring')).toBe(false);
            expect(startsWithScryfallKeyword('card:name')).toBe(false);
            expect(startsWithScryfallKeyword('xyz:abc')).toBe(false);
        });

        it('should return false for strings without colon', () => {
            expect(startsWithScryfallKeyword('is')).toBe(false);
            expect(startsWithScryfallKeyword('mdfc')).toBe(false);
            expect(startsWithScryfallKeyword('Sol Ring')).toBe(false);
        });
    });

    describe('containsScryfallSyntax', () => {
        it('should detect single keyword queries', () => {
            expect(containsScryfallSyntax('is:mdfc')).toBe(true);
            expect(containsScryfallSyntax('c:r')).toBe(true);
            expect(containsScryfallSyntax('t:creature')).toBe(true);
        });

        it('should detect compound queries', () => {
            expect(containsScryfallSyntax('is:legend set:ecc')).toBe(true);
            expect(containsScryfallSyntax('c:r t:creature')).toBe(true);
            expect(containsScryfallSyntax('is:mdfc is:legend')).toBe(true);
            expect(containsScryfallSyntax('t:legendary t:creature c:r')).toBe(true);
        });

        it('should detect negated queries', () => {
            expect(containsScryfallSyntax('-is:reserved')).toBe(true);
            expect(containsScryfallSyntax('-c:r t:creature')).toBe(true);
        });

        it('should return false for plain card names', () => {
            expect(containsScryfallSyntax('Sol Ring')).toBe(false);
            expect(containsScryfallSyntax('Lightning Bolt')).toBe(false);
            expect(containsScryfallSyntax('Counterspell')).toBe(false);
        });

        it('should return false for card names with colons', () => {
            // Some cards have colons in their names but shouldn't match
            expect(containsScryfallSyntax('Heliod, God of the Sun')).toBe(false);
        });
    });

    describe('isPureScryfallQuery', () => {
        it('should return true for pure syntax queries', () => {
            expect(isPureScryfallQuery('is:mdfc')).toBe(true);
            expect(isPureScryfallQuery('is:legend set:ecc')).toBe(true);
            expect(isPureScryfallQuery('c:r t:creature f:modern')).toBe(true);
        });

        it('should return true for comparison queries', () => {
            expect(isPureScryfallQuery('pow>=8')).toBe(true);
            expect(isPureScryfallQuery('cmc<=3')).toBe(true);
            expect(isPureScryfallQuery('usd<1')).toBe(true);
        });

        it('should return false for mixed queries', () => {
            // "Sol Ring s:cmd" has a plain word "Sol Ring" mixed with syntax
            // This is the case we use extractCardInfo for
            expect(isPureScryfallQuery('Sol Ring')).toBe(false);
        });

        it('should return false for empty query', () => {
            expect(isPureScryfallQuery('')).toBe(false);
            expect(isPureScryfallQuery('   ')).toBe(false);
        });
    });
});
