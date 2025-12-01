import { useCallback, useEffect, useRef, useState } from "react";

// Custom hook for normalized numeric inputs
export const useNormalizedInput = (
    initialValue: number,
    onValueChange: (value: number) => void,
    options: { min?: number; max?: number; isInteger?: boolean } = {}
) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const { min, max, isInteger } = options;

    const normalizeValue = useCallback((value: string): string => {
        if (!value.trim()) return ""; // Don't return default values during typing

        // Replace comma with dot
        const normalized = value.replace(",", ".");

        // Remove leading zeros unless it's just "0" or followed by decimal separator
        if (normalized !== "0" && !normalized.startsWith("0.")) {
            return normalized.replace(/^0+(?=\d)/, "");
        }

        return normalized;
    }, []);

    const [warning, setWarning] = useState<string | null>(null);
    const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const value = e.target.value;
            const normalized = normalizeValue(value);
            let finalValue = normalized;

            if (normalized.trim()) {
                let numValue = isInteger
                    ? parseInt(normalized, 10)
                    : parseFloat(normalized);

                if (!isNaN(numValue)) {
                    // Clamp value if min/max are provided
                    let clamped = false;
                    if (typeof min === "number" && numValue < min) {
                        numValue = min;
                        clamped = true;
                    }
                    if (typeof max === "number" && numValue > max) {
                        numValue = max;
                        clamped = true;
                    }

                    if (clamped) {
                        setWarning(`Value limited to ${min !== undefined && numValue === min ? min : max}`);
                        if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
                        warningTimeoutRef.current = setTimeout(() => setWarning(null), 2000);
                    }

                    onValueChange(numValue);

                    // If the value was clamped or normalized differently, update the input
                    const parsedOriginal = isInteger ? parseInt(normalized, 10) : parseFloat(normalized);
                    if (numValue !== parsedOriginal) {
                        finalValue = numValue.toString();
                    }
                }
            }

            // Only update the input if we changed something
            if (finalValue !== value) {
                e.target.value = finalValue;
            }
        },
        [normalizeValue, onValueChange, isInteger, min, max]
    );

    const handleBlur = useCallback(
        (e: React.FocusEvent<HTMLInputElement>) => {
            const value = e.target.value;
            if (!value.trim()) {
                // Set to the placeholder value (which is the current state value)
                const placeholder = e.target.placeholder;
                e.target.value = placeholder;
                const numValue = isInteger
                    ? parseInt(placeholder, 10)
                    : parseFloat(placeholder);
                onValueChange(isNaN(numValue) ? (isInteger ? 1 : 0) : numValue);
            } else {
                // Also clamp on blur just in case
                let numValue = isInteger
                    ? parseInt(value, 10)
                    : parseFloat(value);
                if (!isNaN(numValue)) {
                    if (typeof min === "number") numValue = Math.max(min, numValue);
                    if (typeof max === "number") numValue = Math.min(max, numValue);
                    e.target.value = numValue.toString();
                    onValueChange(numValue);
                }
            }
        },
        [onValueChange, isInteger, min, max]
    );

    // Sync input value with state when state changes externally
    useEffect(() => {
        if (inputRef.current) {
            const currentString = inputRef.current.value;
            const parsedCurrent = isInteger ? parseInt(currentString, 10) : parseFloat(currentString);
            const isFocused = document.activeElement === inputRef.current;

            if (isFocused) {
                // If focused, only update if the values are actually different numbers
                // AND the input is not in an intermediate state (like empty or ending in decimal)
                if (!isNaN(parsedCurrent) && parsedCurrent !== initialValue) {
                    inputRef.current.value = initialValue.toString();
                }
            } else {
                // If not focused, always sync to the state (e.g. Reset button clicked)
                if (currentString !== initialValue.toString()) {
                    inputRef.current.value = initialValue.toString();
                }
            }
        }
    }, [initialValue, isInteger]);

    // Cleanup timeout
    useEffect(() => {
        return () => {
            if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
        };
    }, []);

    return {
        inputRef,
        handleChange,
        handleBlur,
        defaultValue: initialValue,
        warning,
    };
};

// Custom hook for position inputs (supports negative values)
export const usePositionInput = (
    initialValue: number,
    onValueChange: (value: number) => void
) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const normalizeValue = useCallback((value: string): string => {
        if (!value.trim()) return ""; // Don't return default values during typing

        // Handle negative sign
        const isNegative = value.startsWith("-");
        const cleanValue = value.replace(/^-/, "");

        // Replace comma with dot
        const normalized = cleanValue.replace(",", ".");

        // Remove leading zeros unless it's just "0" or followed by decimal separator
        let cleaned = normalized;
        if (cleaned !== "0" && !cleaned.startsWith("0.")) {
            cleaned = cleaned.replace(/^0+(?=\d)/, "");
        }

        return isNegative ? `-${cleaned}` : cleaned;
    }, []);

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const value = e.target.value;
            const normalized = normalizeValue(value);

            // Only update the input if normalization changed the value
            if (normalized !== value) {
                e.target.value = normalized;
            }

            // Only update state if there's a valid value
            if (normalized.trim()) {
                const numValue = parseFloat(normalized);
                if (!isNaN(numValue)) {
                    onValueChange(numValue);
                }
            }
        },
        [normalizeValue, onValueChange]
    );

    const handleBlur = useCallback(
        (e: React.FocusEvent<HTMLInputElement>) => {
            const value = e.target.value;
            if (!value.trim()) {
                // Set to the placeholder value (which is the current state value)
                const placeholder = e.target.placeholder;
                e.target.value = placeholder;
                const numValue = parseFloat(placeholder);
                onValueChange(isNaN(numValue) ? 0 : numValue);
            }
        },
        [onValueChange]
    );

    // Sync input value with state when state changes externally
    useEffect(() => {
        if (inputRef.current) {
            const currentString = inputRef.current.value;
            const parsedCurrent = parseFloat(currentString);
            const isFocused = document.activeElement === inputRef.current;

            if (isFocused) {
                if (!isNaN(parsedCurrent) && parsedCurrent !== initialValue) {
                    inputRef.current.value = initialValue.toString();
                }
            } else {
                if (currentString !== initialValue.toString()) {
                    inputRef.current.value = initialValue.toString();
                }
            }
        }
    }, [initialValue]);

    return {
        inputRef,
        handleChange,
        handleBlur,
        defaultValue: initialValue.toString(),
    };
};
