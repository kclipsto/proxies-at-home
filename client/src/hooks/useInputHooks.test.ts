import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNormalizedInput, usePositionInput } from "./useInputHooks";

describe("useInputHooks", () => {
    describe("useNormalizedInput", () => {
        it("should initialize with default value", () => {
            const onChange = vi.fn();
            const { result } = renderHook(() => useNormalizedInput(10, onChange));

            expect(result.current.defaultValue).toBe(10);
            expect(result.current.inputRef).toBeDefined();
            expect(result.current.warning).toBeNull();
        });

        it("should handle change events and normalize comma to dot", () => {
            const onChange = vi.fn();
            const { result } = renderHook(() => useNormalizedInput(0, onChange));

            const mockEvent = {
                target: { value: "3,5" },
            } as React.ChangeEvent<HTMLInputElement>;

            act(() => {
                result.current.handleChange(mockEvent);
            });

            expect(onChange).toHaveBeenCalledWith(3.5);
        });

        it("should clamp values to min", () => {
            const onChange = vi.fn();
            const { result } = renderHook(() =>
                useNormalizedInput(5, onChange, { min: 1, max: 10 })
            );

            const mockEvent = {
                target: { value: "-5" },
            } as React.ChangeEvent<HTMLInputElement>;

            act(() => {
                result.current.handleChange(mockEvent);
            });

            expect(onChange).toHaveBeenCalledWith(1);
            expect(result.current.warning).not.toBeNull();
        });

        it("should clamp values to max", () => {
            const onChange = vi.fn();
            const { result } = renderHook(() =>
                useNormalizedInput(5, onChange, { min: 1, max: 10 })
            );

            const mockEvent = {
                target: { value: "100" },
            } as React.ChangeEvent<HTMLInputElement>;

            act(() => {
                result.current.handleChange(mockEvent);
            });

            expect(onChange).toHaveBeenCalledWith(10);
            expect(result.current.warning).not.toBeNull();
        });

        it("should handle integer mode", () => {
            const onChange = vi.fn();
            const { result } = renderHook(() =>
                useNormalizedInput(0, onChange, { isInteger: true })
            );

            const mockEvent = {
                target: { value: "5.9" },
            } as React.ChangeEvent<HTMLInputElement>;

            act(() => {
                result.current.handleChange(mockEvent);
            });

            expect(onChange).toHaveBeenCalledWith(5);
        });

        it("should remove leading zeros", () => {
            const onChange = vi.fn();
            const { result } = renderHook(() => useNormalizedInput(0, onChange));

            const mockEvent = {
                target: { value: "007" },
            } as React.ChangeEvent<HTMLInputElement>;

            act(() => {
                result.current.handleChange(mockEvent);
            });

            expect(onChange).toHaveBeenCalledWith(7);
        });

        it("should not remove leading zero before decimal", () => {
            const onChange = vi.fn();
            const { result } = renderHook(() => useNormalizedInput(0, onChange));

            const mockEvent = {
                target: { value: "0.5" },
            } as React.ChangeEvent<HTMLInputElement>;

            act(() => {
                result.current.handleChange(mockEvent);
            });

            expect(onChange).toHaveBeenCalledWith(0.5);
        });
    });

    describe("usePositionInput", () => {
        it("should initialize with default value as string", () => {
            const onChange = vi.fn();
            const { result } = renderHook(() => usePositionInput(10, onChange));

            expect(result.current.defaultValue).toBe("10");
            expect(result.current.inputRef).toBeDefined();
        });

        it("should handle negative values", () => {
            const onChange = vi.fn();
            const { result } = renderHook(() => usePositionInput(0, onChange));

            const mockEvent = {
                target: { value: "-5" },
            } as React.ChangeEvent<HTMLInputElement>;

            act(() => {
                result.current.handleChange(mockEvent);
            });

            expect(onChange).toHaveBeenCalledWith(-5);
        });

        it("should normalize comma to dot", () => {
            const onChange = vi.fn();
            const { result } = renderHook(() => usePositionInput(0, onChange));

            const mockEvent = {
                target: { value: "-3,5" },
            } as React.ChangeEvent<HTMLInputElement>;

            act(() => {
                result.current.handleChange(mockEvent);
            });

            expect(onChange).toHaveBeenCalledWith(-3.5);
        });

        it("should not call onChange for empty value", () => {
            const onChange = vi.fn();
            const { result } = renderHook(() => usePositionInput(0, onChange));

            const mockEvent = {
                target: { value: "" },
            } as React.ChangeEvent<HTMLInputElement>;

            act(() => {
                result.current.handleChange(mockEvent);
            });

            expect(onChange).not.toHaveBeenCalled();
        });
    });
});
