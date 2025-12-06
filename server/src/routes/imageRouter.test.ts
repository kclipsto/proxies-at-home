import { vi, describe, beforeEach, afterEach, it, expect, type Mock } from 'vitest';
import request from "supertest";
import express, { type Express, type Response } from "express";
import fs from "fs";
import axios from "axios";
import { Writable } from "stream";
import { imageRouter } from "./imageRouter";

vi.mock("axios", () => {
    const mockGet = vi.fn();
    const mockInstance = { get: mockGet };
    const mockCreate = vi.fn(() => mockInstance);
    return {
        create: mockCreate,
        get: mockGet,
        default: {
            create: mockCreate,
            get: mockGet,
        },
    };
});

vi.mock("fs", () => {
    const mockedPromises = {
        stat: vi.fn(),
        utimes: vi.fn().mockResolvedValue(undefined),
        unlink: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined),
    };

    const mocked = {
        existsSync: vi.fn(),
        createWriteStream: vi.fn(),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
        readdir: vi.fn(),
        unlink: vi.fn(),
        readdirSync: vi.fn(),
        statSync: vi.fn(),
        unlinkSync: vi.fn(),
        utimesSync: vi.fn(),
        promises: mockedPromises,
    };
    return { ...mocked, default: mocked };
});


vi.mock("fs/promises", () => {
    const mocked = {
        stat: vi.fn(),
        utimes: vi.fn(),
        unlink: vi.fn(),
    };
    return { ...mocked, default: mocked };
});

vi.mock("crypto", () => {
    const mockHash = {
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue("fake-hash"),
    };
    const mocked = {
        createHash: vi.fn(() => mockHash),
    };
    return { ...mocked, default: mocked };
});

// Access the mocked instance's get method
const mockedAxiosInstance = axios.create() as unknown as { get: Mock };
const mockedAxios = {
    get: mockedAxiosInstance.get,
    create: axios.create as Mock,
};

describe("getWithRetry logic", () => {
    let app: Express;
    let writeStream: Writable;

    const imageUrl = "http://example.com/image.jpg";

    beforeEach(() => {
        vi.clearAllMocks();
        mockedAxios.create.mockClear();
        mockedAxios.get.mockReset();
        // Default mock implementation for fs.existsSync to avoid "not found" errors in general flow
        (fs.existsSync as unknown as Mock).mockReturnValue(false);
        (fs.readdir as unknown as Mock).mockImplementation((_path, cb) => cb(null, ["file1.png", "file2.png"]));
        (fs.unlink as unknown as Mock).mockImplementation((_path, cb) => cb(null));
        (fs.readdirSync as unknown as Mock).mockReturnValue([]);


        app = express();
        app.use(express.json());
        app.set("etag", false);
        app.use("/images", imageRouter);

        writeStream = new Writable({
            write(_chunk, _encoding, callback) {
                callback();
            },
        });
        (fs.createWriteStream as unknown as Mock).mockReturnValue(writeStream);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it("should serve from cache if file exists", async () => {
        (fs.existsSync as unknown as Mock).mockReturnValue(true);
        const sendFileSpy = vi.spyOn(express.response, "sendFile").mockImplementation(function (this: Response) {
            this.type("image/jpeg").send("cached image data");
        });

        const res = await request(app).get(`/images/proxy?url=${encodeURIComponent(imageUrl)}`);
        expect(res.status).toBe(200);
        expect(res.body.toString()).toBe("cached image data");
        expect(fs.promises.utimes).toHaveBeenCalled();
        sendFileSpy.mockRestore();
    });

    it("should succeed on the first try", async () => {
        mockedAxios.get.mockResolvedValue({
            status: 200,
            data: Buffer.from("image data"),
            headers: { "content-type": "image/jpeg" },
        });

        const sendFileSpy = vi.spyOn(express.response, "sendFile").mockImplementation(function (this: Response) {
            this.type("image/jpeg").send("image data");
        });

        const res = await request(app).get(`/images/proxy?url=${encodeURIComponent(imageUrl)}`);
        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toContain("image/jpeg");
        sendFileSpy.mockRestore();
    });

    it("should retry on 429 and then succeed", async () => {
        mockedAxios.get
            .mockResolvedValueOnce({ status: 429, headers: { "retry-after": "1" } })
            .mockResolvedValueOnce({
                status: 200,
                data: Buffer.from("image data"),
                headers: { "content-type": "image/jpeg" },
            });

        const sendFileSpy = vi.spyOn(express.response, "sendFile").mockImplementation(function (this: Response) {
            this.type("image/jpeg").send("image data");
        });

        const res = await request(app).get(`/images/proxy?url=${encodeURIComponent(imageUrl)}`);
        expect(res.status).toBe(200);
        expect(mockedAxios.get).toHaveBeenCalledTimes(2);
        sendFileSpy.mockRestore();
    }, 20000);

    it("should retry on generic error and then succeed", async () => {
        mockedAxios.get
            .mockRejectedValueOnce(new Error("Network Error"))
            .mockResolvedValueOnce({
                status: 200,
                data: Buffer.from("image data"),
                headers: { "content-type": "image/jpeg" },
            });

        const sendFileSpy = vi.spyOn(express.response, "sendFile").mockImplementation(function (this: Response) {
            this.type("image/jpeg").send("image data");
        });

        const res = await request(app).get(`/images/proxy?url=${encodeURIComponent(imageUrl)}`);
        expect(res.status).toBe(200);
        expect(mockedAxios.get).toHaveBeenCalledTimes(2);
        sendFileSpy.mockRestore();
    }, 20000);

    it("should fail after all retries", async () => {
        mockedAxios.get.mockRejectedValue(new Error("Network Error"));

        const res = await request(app).get(`/images/proxy?url=${encodeURIComponent(imageUrl)}`);
        expect(res.status).toBe(502);
        expect(mockedAxios.get).toHaveBeenCalledTimes(3); // 3 retries configured in imageRouter.ts
    }, 20000);

    it("should return an error for a 0-byte image and not cache it", async () => {
        mockedAxios.get.mockResolvedValue({
            status: 200,
            data: Buffer.from(""),
            headers: { "content-type": "image/jpeg" },
        });

        const res = await request(app).get(`/images/proxy?url=${encodeURIComponent(imageUrl)}`);
        expect(res.status).toBe(502);
        expect(res.body.error).toBe("Upstream is a 0-byte image");
        expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it("should return a diagnostic object for /diag endpoint", async () => {
        const res = await request(app).get("/images/diag");
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.now).toBeDefined();
    });

    describe("POST /", () => {
        it("should return 400 for invalid body", async () => {
            const res = await request(app).post("/images").send({});
            expect(res.status).toBe(400);
            expect(res.body.error).toBeDefined();
        });

        it("should process valid card info and return images", async () => {
            // Mock getImagesForCardInfo (we can mock the imported function if needed, or rely on axios mock)
            // Since getImagesForCardInfo calls axios, and we mocked axios, it should work.
            // But getImagesForCardInfo is imported.
            // We should probably mock getImagesForCardInfo to isolate imageRouter logic.
            // But for now, let's rely on axios mock.
            mockedAxios.get.mockResolvedValue({
                data: {
                    data: [{ image_uris: { png: "http://scryfall.com/img.png" } }],
                    has_more: false,
                },
            });

            const res = await request(app)
                .post("/images")
                .send({ cardQueries: [{ name: "Sol Ring" }] });

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(1);
            expect(res.body[0].imageUrls).toEqual(["http://scryfall.com/img.png"]);
        });
    });

    describe("POST /images-stream", () => {
        it("should return 200 and empty stream for invalid body", async () => {
            const res = await request(app).post("/images/images-stream").send({});
            expect(res.status).toBe(200);
            expect(res.header["content-type"]).toBe("text/event-stream");
        });
    });

    describe("POST /upload", () => {
        it("should handle file uploads", async () => {
            const res = await request(app)
                .post("/images/upload")
                .attach("images", Buffer.from("fake image"), "test.png");

            expect(res.status).toBe(200);
            expect(res.body.uploaded).toHaveLength(1);
            expect(res.body.uploaded[0].name).toBe("test.png");
        });
    });

    describe("GET /front (Google Drive Proxy)", () => {
        it("should return 400 if id is missing", async () => {
            const res = await request(app).get("/images/front");
            expect(res.status).toBe(400);
        });

        it("should proxy image from Google Drive", async () => {
            mockedAxios.get.mockResolvedValue({
                headers: { "content-type": "image/jpeg" },
                data: { pipe: (res: Writable) => res.end("image data") },
            });

            const res = await request(app).get("/images/front?id=123");
            expect(res.status).toBe(200);
            expect(res.header["content-type"]).toBe("image/jpeg");
        });

        it("should return 502 if GDrive fails", async () => {
            mockedAxios.get.mockRejectedValue(new Error("Failed"));
            const res = await request(app).get("/images/front?id=123");
            expect(res.status).toBe(502);
        });

        it("should skip non-image responses from GDrive", async () => {
            mockedAxios.get
                .mockResolvedValueOnce({ headers: { "content-type": "text/html" } }) // First candidate
                .mockResolvedValueOnce({ headers: { "content-type": "text/html" } }) // Second candidate
                .mockResolvedValueOnce({ headers: { "content-type": "text/html" } }); // Third candidate

            const res = await request(app).get("/images/front?id=123");
            expect(res.status).toBe(502);
        });
    });

    describe("DELETE /", () => {
        it("should start clearing cache", async () => {
            const res = await request(app).delete("/images");
            expect(res.status).toBe(200);
            expect(res.body.message).toBe("Cached images clearing started.");
        });

        it("should handle readdir errors", async () => {
            (fs.readdir as unknown as Mock).mockImplementation((_path, cb) => cb(new Error("Read error")));
            const res = await request(app).delete("/images");
            expect(res.status).toBe(500);
        });

        it("should handle empty cache directory", async () => {
            (fs.readdir as unknown as Mock).mockImplementation((_path, cb) => cb(null, []));
            const res = await request(app).delete("/images");
            expect(res.status).toBe(200);
            expect(res.body.message).toBe("Cached images clearing started.");
        });
    });

    describe("Cache Cleanup Logic", () => {
        it("should clean cache if size exceeds limit", async () => {
            vi.useFakeTimers();
            // Advance time to ensure cleanup triggers (default lastCacheCleanup is 0, so usually triggers immediately, 
            // but let's be safe and consistent with previous intent)
            const now = Date.now();
            vi.setSystemTime(now + 6 * 60 * 1000);

            // Mock fs.readdirSync to return files
            (fs.readdirSync as unknown as Mock).mockReturnValue(["file1.png", "file2.png"]);

            // Mock fs.statSync to return large size
            (fs.statSync as unknown as Mock).mockReturnValue({
                isFile: () => true,
                atimeMs: now,
                size: 7 * 1024 * 1024 * 1024, // 7GB each, total 14GB > 12GB
            });

            // Mock fs.unlinkSync
            (fs.unlinkSync as unknown as Mock).mockImplementation(() => { });

            // Trigger cleanup via proxy endpoint
            const url = "http://example.com/image.png";
            (fs.existsSync as unknown as Mock).mockReturnValue(false); // Not in cache
            mockedAxios.get.mockResolvedValue({
                status: 200,
                data: Buffer.from("image data"),
                headers: { "content-type": "image/png" },
            });

            await request(app).get(`/images/proxy?url=${encodeURIComponent(url)}`);

            // Verify cleanup was attempted
            expect(fs.readdirSync).toHaveBeenCalled();
            expect(fs.unlinkSync).toHaveBeenCalled();
        });
    });

    describe("Proxy Error Handling", () => {
        it("should return 502 if upstream returns 404", async () => {
            const url = "http://example.com/404.png";
            (fs.existsSync as unknown as Mock).mockReturnValue(false);
            mockedAxios.get.mockResolvedValue({ status: 404, data: "Not Found" });

            const res = await request(app).get(`/images/proxy?url=${encodeURIComponent(url)}`);
            expect(res.status).toBe(502);
            expect(res.body.error).toBe("Failed to download image");
        });

        it("should return 502 if upstream returns non-image", async () => {
            const url = "http://example.com/text.txt";
            (fs.existsSync as unknown as Mock).mockReturnValue(false);
            mockedAxios.get.mockResolvedValue({
                status: 200,
                data: Buffer.from("text data"),
                headers: { "content-type": "text/plain" },
            });

            const res = await request(app).get(`/images/proxy?url=${encodeURIComponent(url)}`);
            expect(res.status).toBe(502);
            expect(res.body.error).toBe("Upstream not image");
        });

        it("should return 400 if url query param is missing", async () => {
            const res = await request(app).get("/images/proxy");
            expect(res.status).toBe(400);
            expect(res.body.error).toBe("Missing or invalid ?url");
        });

        it("should return 400 if url query param is not a string", async () => {
            const res = await request(app).get("/images/proxy?url[]=invalid");
            expect(res.status).toBe(400);
            expect(res.body.error).toBe("Missing or invalid ?url");
        });

        it("should return 502 if upstream returns 400 with data", async () => {
            const url = "http://example.com/error.png";
            (fs.existsSync as unknown as Mock).mockReturnValue(false);
            mockedAxios.get.mockResolvedValue({
                status: 400,
                data: Buffer.from("error data"),
                headers: { "content-type": "image/png" }
            });

            const res = await request(app).get(`/images/proxy?url=${encodeURIComponent(url)}`);
            expect(res.status).toBe(502);
            // When upstream returns 4xx, getWithRetry throws "HTTP 400" error
            // which is caught and returns "Failed to download image"
            expect(res.body.error).toBe("Failed to download image");
        });
    });
});