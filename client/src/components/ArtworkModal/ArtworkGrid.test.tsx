import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ArtworkGrid } from "./ArtworkGrid";

describe("ArtworkGrid", () => {
    const mockImageUrls = [
        "https://example.com/image1.png",
        "https://example.com/image2.png",
        "https://example.com/image3.png",
    ];

    describe("rendering", () => {
        it("should render all images", () => {
            render(
                <ArtworkGrid
                    imageUrls={mockImageUrls}
                    selectedId={undefined}
                    processedDisplayUrl={null}
                    onSelectArtwork={() => { }}
                />
            );

            const images = screen.getAllByRole("img");
            expect(images).toHaveLength(3);
        });

        it("should render images with correct src", () => {
            render(
                <ArtworkGrid
                    imageUrls={mockImageUrls}
                    selectedId={undefined}
                    processedDisplayUrl={null}
                    onSelectArtwork={() => { }}
                />
            );

            const images = screen.getAllByRole("img") as HTMLImageElement[];
            expect(images[0].src).toBe("https://example.com/image1.png");
            expect(images[1].src).toBe("https://example.com/image2.png");
            expect(images[2].src).toBe("https://example.com/image3.png");
        });

        it("should render empty when no images provided", () => {
            const { container } = render(
                <ArtworkGrid
                    imageUrls={[]}
                    selectedId={undefined}
                    processedDisplayUrl={null}
                    onSelectArtwork={() => { }}
                />
            );

            expect(container.querySelectorAll("img")).toHaveLength(0);
        });

        it("should apply lazy loading to images", () => {
            render(
                <ArtworkGrid
                    imageUrls={mockImageUrls}
                    selectedId={undefined}
                    processedDisplayUrl={null}
                    onSelectArtwork={() => { }}
                />
            );

            const images = screen.getAllByRole("img") as HTMLImageElement[];
            images.forEach((img) => {
                expect(img.getAttribute("loading")).toBe("lazy");
            });
        });
    });

    describe("selection", () => {
        it("should call onSelectArtwork when clicking an image", () => {
            const onSelectArtwork = vi.fn();

            render(
                <ArtworkGrid
                    imageUrls={mockImageUrls}
                    selectedId={undefined}
                    processedDisplayUrl={null}
                    onSelectArtwork={onSelectArtwork}
                />
            );

            const images = screen.getAllByRole("img");
            fireEvent.click(images[1]);

            expect(onSelectArtwork).toHaveBeenCalledWith("https://example.com/image2.png");
        });

        it("should call onSelectArtwork with correct URL for each image", () => {
            const onSelectArtwork = vi.fn();

            render(
                <ArtworkGrid
                    imageUrls={mockImageUrls}
                    selectedId={undefined}
                    processedDisplayUrl={null}
                    onSelectArtwork={onSelectArtwork}
                />
            );

            const images = screen.getAllByRole("img");

            fireEvent.click(images[0]);
            expect(onSelectArtwork).toHaveBeenCalledWith("https://example.com/image1.png");

            fireEvent.click(images[2]);
            expect(onSelectArtwork).toHaveBeenCalledWith("https://example.com/image3.png");
        });
    });

    describe("selected state styling", () => {
        it("should apply green border to selected image", () => {
            render(
                <ArtworkGrid
                    imageUrls={mockImageUrls}
                    selectedId="https://example.com/image2.png"
                    processedDisplayUrl={null}
                    onSelectArtwork={() => { }}
                />
            );

            const images = screen.getAllByRole("img") as HTMLImageElement[];
            expect(images[1].className).toContain("border-green-500");
        });

        it("should apply transparent border to non-selected images", () => {
            render(
                <ArtworkGrid
                    imageUrls={mockImageUrls}
                    selectedId="https://example.com/image2.png"
                    processedDisplayUrl={null}
                    onSelectArtwork={() => { }}
                />
            );

            const images = screen.getAllByRole("img") as HTMLImageElement[];
            expect(images[0].className).toContain("border-transparent");
            expect(images[2].className).toContain("border-transparent");
        });

        it("should show cursor-pointer on all images", () => {
            render(
                <ArtworkGrid
                    imageUrls={mockImageUrls}
                    selectedId={undefined}
                    processedDisplayUrl={null}
                    onSelectArtwork={() => { }}
                />
            );

            const images = screen.getAllByRole("img") as HTMLImageElement[];
            images.forEach((img) => {
                expect(img.className).toContain("cursor-pointer");
            });
        });
    });

    describe("processed display URL", () => {
        it("should use processedDisplayUrl for selected image when provided", () => {
            render(
                <ArtworkGrid
                    imageUrls={mockImageUrls}
                    selectedId="https://example.com/image2.png"
                    processedDisplayUrl="https://example.com/processed.png"
                    onSelectArtwork={() => { }}
                />
            );

            const images = screen.getAllByRole("img") as HTMLImageElement[];
            expect(images[1].src).toBe("https://example.com/processed.png");
        });

        it("should use original URL for non-selected images even when processedDisplayUrl is provided", () => {
            render(
                <ArtworkGrid
                    imageUrls={mockImageUrls}
                    selectedId="https://example.com/image2.png"
                    processedDisplayUrl="https://example.com/processed.png"
                    onSelectArtwork={() => { }}
                />
            );

            const images = screen.getAllByRole("img") as HTMLImageElement[];
            expect(images[0].src).toBe("https://example.com/image1.png");
            expect(images[2].src).toBe("https://example.com/image3.png");
        });

        it("should use original URL for selected image when processedDisplayUrl is null", () => {
            render(
                <ArtworkGrid
                    imageUrls={mockImageUrls}
                    selectedId="https://example.com/image2.png"
                    processedDisplayUrl={null}
                    onSelectArtwork={() => { }}
                />
            );

            const images = screen.getAllByRole("img") as HTMLImageElement[];
            expect(images[1].src).toBe("https://example.com/image2.png");
        });
    });
});
