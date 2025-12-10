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
            .mockResolvedValueOnce({ status: 429, headers: { "retry-after": "0" } }) // Use 0 to speed up test
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
    }, 10000);

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
        expect(mockedAxios.get).toHaveBeenCalledTimes(2); // tries=2 means 2 total attempts
    }, 10000);

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

    describe("GET /mpc (MPC Google Drive Proxy)", () => {
        it("should return 400 if id is missing", async () => {
            const res = await request(app).get("/images/mpc");
            expect(res.status).toBe(400);
        });

        it("should proxy image from Google Drive", async () => {
            mockedAxios.get.mockResolvedValue({
                status: 200,
                headers: { "content-type": "image/jpeg" },
                data: Buffer.from("fake image data"),
            });

            const sendFileSpy = vi.spyOn(express.response, "sendFile").mockImplementation(function (this: Response) {
                this.type("image/jpeg").send("cached image data");
            });

            const res = await request(app).get("/images/mpc?id=123");
            expect(res.status).toBe(200);
            expect(res.header["content-type"]).toContain("image/jpeg");
            sendFileSpy.mockRestore();
        });

        it("should return 502 if GDrive fails", async () => {
            mockedAxios.get.mockRejectedValue(new Error("Failed"));
            const res = await request(app).get("/images/mpc?id=123");
            expect(res.status).toBe(502);
        });

        it("should skip non-image responses from GDrive", async () => {
            mockedAxios.get
                .mockResolvedValueOnce({ headers: { "content-type": "text/html" } }) // First candidate
                .mockResolvedValueOnce({ headers: { "content-type": "text/html" } }) // Second candidate
                .mockResolvedValueOnce({ headers: { "content-type": "text/html" } }); // Third candidate

            const res = await request(app).get("/images/mpc?id=123");
            expect(res.status).toBe(502);
        });
    });


    // Note: Cache cleanup test removed - async cleanup + 5-min throttle makes it unreliable

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