import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock dependencies before importing router
vi.mock('../db/db.js', () => ({
    getDatabase: vi.fn(() => ({
        prepare: vi.fn(() => ({
            get: vi.fn(() => undefined),
            run: vi.fn(),
        })),
    })),
}));

vi.mock('../utils/debug.js', () => ({
    debugLog: vi.fn(),
}));

vi.mock('axios', () => {
    const mockAxios = {
        create: vi.fn(() => mockAxios),
        get: vi.fn(),
        isAxiosError: vi.fn((err) => err?.isAxiosError === true),
    };
    return { default: mockAxios };
});

import { scryfallRouter } from './scryfallRouter.js';
import axios from 'axios';

describe('scryfallRouter', () => {
    let app: express.Application;

    beforeEach(() => {
        app = express();
        app.use('/api/scryfall', scryfallRouter);
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('GET /autocomplete', () => {
        it('should return empty array for short queries', async () => {
            const res = await request(app).get('/api/scryfall/autocomplete?q=s');
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ object: 'catalog', data: [] });
        });

        it('should proxy to Scryfall for valid queries', async () => {
            const mockResponse = { data: ['Sol Ring', 'Soltari Crusader'] };
            vi.mocked(axios.get).mockResolvedValueOnce({ data: mockResponse });

            const res = await request(app).get('/api/scryfall/autocomplete?q=sol');
            expect(res.status).toBe(200);
            expect(res.body).toEqual(mockResponse);
            expect(axios.get).toHaveBeenCalledWith('/cards/autocomplete', { params: { q: 'sol' } });
        });

        it('should return 500 on upstream error', async () => {
            vi.mocked(axios.get).mockRejectedValueOnce(new Error('Network error'));

            const res = await request(app).get('/api/scryfall/autocomplete?q=sol');
            expect(res.status).toBe(500);
            expect(res.body.error).toBe('Failed to fetch autocomplete');
        });
    });

    describe('GET /named', () => {
        it('should return 400 when no exact or fuzzy param', async () => {
            const res = await request(app).get('/api/scryfall/named');
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Missing exact or fuzzy parameter');
        });

        it('should proxy exact query to Scryfall', async () => {
            const mockCard = { name: 'Sol Ring', set: 'cmd' };
            vi.mocked(axios.get).mockResolvedValueOnce({ data: mockCard });

            const res = await request(app).get('/api/scryfall/named?exact=Sol%20Ring');
            expect(res.status).toBe(200);
            expect(res.body).toEqual(mockCard);
            expect(axios.get).toHaveBeenCalledWith('/cards/named', { params: { exact: 'Sol Ring' } });
        });

        it('should proxy fuzzy query to Scryfall', async () => {
            const mockCard = { name: 'Sol Ring', set: 'cmd' };
            vi.mocked(axios.get).mockResolvedValueOnce({ data: mockCard });

            const res = await request(app).get('/api/scryfall/named?fuzzy=sol%20rng');
            expect(res.status).toBe(200);
            expect(res.body).toEqual(mockCard);
            expect(axios.get).toHaveBeenCalledWith('/cards/named', { params: { fuzzy: 'sol rng' } });
        });

        it('should forward Scryfall 404 errors', async () => {
            const axiosError = {
                isAxiosError: true,
                response: { status: 404, data: { error: 'Card not found' } },
            };
            vi.mocked(axios.get).mockRejectedValueOnce(axiosError);
            vi.mocked(axios.isAxiosError).mockReturnValueOnce(true);

            const res = await request(app).get('/api/scryfall/named?exact=NotACard');
            expect(res.status).toBe(404);
        });
    });

    describe('GET /search', () => {
        it('should return 400 when no q param', async () => {
            const res = await request(app).get('/api/scryfall/search');
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Missing q parameter');
        });

        it('should proxy search query to Scryfall', async () => {
            const mockResponse = { data: [{ name: 'Sol Ring' }] };
            vi.mocked(axios.get).mockResolvedValueOnce({ data: mockResponse });

            const res = await request(app).get('/api/scryfall/search?q=set:cmd');
            expect(res.status).toBe(200);
            expect(res.body).toEqual(mockResponse);
            expect(axios.get).toHaveBeenCalledWith('/cards/search', { params: { q: 'set:cmd' } });
        });

        it('should pass through optional params', async () => {
            const mockResponse = { data: [] };
            vi.mocked(axios.get).mockResolvedValueOnce({ data: mockResponse });

            const res = await request(app).get('/api/scryfall/search?q=test&unique=prints&order=released');
            expect(res.status).toBe(200);
            expect(axios.get).toHaveBeenCalledWith('/cards/search', {
                params: { q: 'test', unique: 'prints', order: 'released' },
            });
        });

        it('should pass through is: syntax unchanged', async () => {
            const mockResponse = { data: [{ name: 'Krenko, Mob Boss' }] };
            vi.mocked(axios.get).mockResolvedValueOnce({ data: mockResponse });

            const res = await request(app).get('/api/scryfall/search?q=is:commander+c:r');
            expect(res.status).toBe(200);
            expect(axios.get).toHaveBeenCalledWith('/cards/search', { params: { q: 'is:commander c:r' } });
        });

        it('should pass through complex Scryfall syntax', async () => {
            const mockResponse = { data: [] };
            vi.mocked(axios.get).mockResolvedValueOnce({ data: mockResponse });

            // Test: is:fetchland, o: (oracle text), c: (colors)
            const res = await request(app).get('/api/scryfall/search?q=is:fetchland+o:search');
            expect(res.status).toBe(200);
            expect(axios.get).toHaveBeenCalledWith('/cards/search', { params: { q: 'is:fetchland o:search' } });
        });

        it('should pass through t:legend as type filter, not token search', async () => {
            const mockResponse = { data: [{ name: 'Krenko, Mob Boss' }] };
            vi.mocked(axios.get).mockResolvedValueOnce({ data: mockResponse });

            // t:legend should NOT become "legend type:token"
            // It should pass through as t:legend for Scryfall to interpret as type:legendary
            const res = await request(app).get('/api/scryfall/search?q=t:legend');
            expect(res.status).toBe(200);
            expect(axios.get).toHaveBeenCalledWith('/cards/search', { params: { q: 't:legend' } });
        });
    });

    describe('GET /cards/:set/:number', () => {
        it('should proxy card lookup to Scryfall', async () => {
            const mockCard = { name: 'Sol Ring', set: 'cmd', collector_number: '235' };
            vi.mocked(axios.get).mockResolvedValueOnce({ data: mockCard });

            const res = await request(app).get('/api/scryfall/cards/cmd/235');
            expect(res.status).toBe(200);
            expect(res.body).toEqual(mockCard);
            expect(axios.get).toHaveBeenCalledWith('/cards/cmd/235');
        });

        it('should include language in path when provided', async () => {
            const mockCard = { name: 'Sol Ring', lang: 'ja' };
            vi.mocked(axios.get).mockResolvedValueOnce({ data: mockCard });

            const res = await request(app).get('/api/scryfall/cards/cmd/235?lang=ja');
            expect(res.status).toBe(200);
            expect(axios.get).toHaveBeenCalledWith('/cards/cmd/235/ja');
        });
    });
});
