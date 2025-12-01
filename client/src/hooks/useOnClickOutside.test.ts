import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useOnClickOutside } from "./useOnClickOutside";

describe("useOnClickOutside", () => {
    it("should call handler when clicking outside", () => {
        const handler = vi.fn();
        const ref = { current: document.createElement("div") };
        document.body.appendChild(ref.current);

        renderHook(() => useOnClickOutside(ref, handler));

        // Click outside
        document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        expect(handler).toHaveBeenCalled();

        // Cleanup
        document.body.removeChild(ref.current);
    });

    it("should not call handler when clicking inside", () => {
        const handler = vi.fn();
        const ref = { current: document.createElement("div") };
        document.body.appendChild(ref.current);

        renderHook(() => useOnClickOutside(ref, handler));

        // Click inside
        ref.current.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        expect(handler).not.toHaveBeenCalled();

        // Cleanup
        document.body.removeChild(ref.current);
    });
});
