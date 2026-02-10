import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/db';
import { getAllCardbacks, BUILTIN_CARDBACKS, type CardbackOption } from './cardbackLibrary';

describe('Cardback Library', () => {
    beforeEach(async () => {
        await db.cardbacks.clear();
    });

    describe('BUILTIN_CARDBACKS', () => {
        it('should have at least one built-in cardback', () => {
            expect(BUILTIN_CARDBACKS.length).toBeGreaterThanOrEqual(1);
        });

        it('should have valid structure for each built-in cardback', () => {
            for (const cb of BUILTIN_CARDBACKS) {
                expect(cb.id).toBeDefined();
                expect(cb.name).toBeDefined();
                expect(cb.imageUrl).toBeDefined();
                expect(cb.source).toBe('builtin');
            }
        });

        it('should have IDs starting with cardback_builtin_', () => {
            for (const cb of BUILTIN_CARDBACKS) {
                expect(cb.id.startsWith('cardback_builtin_')).toBe(true);
            }
        });
    });

    describe('getAllCardbacks', () => {
        it('should include built-in cardbacks', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
            // Pre-add builtin cardbacks to database
            for (const cardback of BUILTIN_CARDBACKS) {
                await db.cardbacks.add({
                    id: cardback.id,
                    sourceUrl: cardback.imageUrl,
                    hasBuiltInBleed: cardback.hasBuiltInBleed,
                });
            }

            const cardbacks = await getAllCardbacks();
            const builtinCardbacks = cardbacks.filter((c: CardbackOption) => c.source === 'builtin');
            expect(builtinCardbacks.length).toBeGreaterThanOrEqual(1);
            consoleSpy.mockRestore();
        });

        it('should include uploaded cardbacks', async () => {
            // Add an uploaded cardback to the database (using cardback_ prefix)
            await db.cardbacks.add({
                id: 'cardback_uploaded_test1',
                sourceUrl: 'uploaded://cardback1.png',
            });

            const cardbacks = await getAllCardbacks();
            const uploadedCardback = cardbacks.find((c: CardbackOption) => c.id === 'cardback_uploaded_test1');

            expect(uploadedCardback).toBeDefined();
            expect(uploadedCardback?.source).toBe('uploaded');
        });

        it('should include MPC-imported cardbacks', async () => {
            // Add an MPC cardback (using cardback_ prefix)
            await db.cardbacks.add({
                id: 'cardback_mpc_abc123',
                sourceUrl: 'mpc://abc123',
                hasBuiltInBleed: true,
            });

            const cardbacks = await getAllCardbacks();
            const mpcCardback = cardbacks.find((c: CardbackOption) => c.id === 'cardback_mpc_abc123');

            expect(mpcCardback).toBeDefined();
            expect(mpcCardback?.source).toBe('uploaded'); // MPC cardbacks stored as uploaded
        });
    });
});
