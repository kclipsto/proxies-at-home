import { ChevronDown, ChevronUp } from "lucide-react";
import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useRef,
} from "react";
import { TextInput } from "flowbite-react";
import type { TextInputProps } from "flowbite-react";

type NumberInputProps = Omit<TextInputProps, "ref"> & {
    min?: number;
    max?: number;
    step?: number;
    value?: number | string;
    defaultValue?: number | string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
    ({ min, max, step = 1, className, onChange, ...props }, ref) => {
        const innerRef = useRef<HTMLInputElement>(null);
        useImperativeHandle(ref, () => innerRef.current!);

        const intervalRef = useRef<NodeJS.Timeout | null>(null);
        const timeoutRef = useRef<NodeJS.Timeout | null>(null);

        const triggerChange = useCallback(() => {
            if (innerRef.current) {
                // Dispatch native events for any non-React listeners
                const nativeChange = new Event("change", { bubbles: true });
                const nativeInput = new Event("input", { bubbles: true });
                innerRef.current.dispatchEvent(nativeInput);
                innerRef.current.dispatchEvent(nativeChange);

                // Explicitly call the React onChange prop if it exists
                if (onChange) {
                    const syntheticEvent = {
                        target: innerRef.current,
                        currentTarget: innerRef.current,
                        bubbles: true,
                        cancelable: false,
                        defaultPrevented: false,
                        eventPhase: 3,
                        isTrusted: true,
                        nativeEvent: nativeChange,
                        persist: () => { },
                        preventDefault: () => { },
                        isDefaultPrevented: () => false,
                        stopPropagation: () => { },
                        isPropagationStopped: () => false,
                        type: 'change',
                    } as unknown as React.ChangeEvent<HTMLInputElement>;

                    onChange(syntheticEvent);
                }
            }
        }, [onChange]);

        const updateValue = useCallback(
            (delta: number) => {
                if (!innerRef.current) return;

                const currentValue = parseFloat(innerRef.current.value) || 0;
                const newValue = currentValue + delta;

                // Check bounds
                if (typeof min === "number" && newValue < min) return;
                if (typeof max === "number" && newValue > max) return;

                // Round to avoid floating point errors
                const precision = step.toString().split(".")[1]?.length || 0;
                const rounded = parseFloat(newValue.toFixed(precision));

                innerRef.current.value = rounded.toString();
                triggerChange();
            },
            [min, max, step, triggerChange]
        );

        const isSpinning = useRef(false);
        const ignoreMouseRef = useRef(false);

        const startSpin = useCallback(
            (delta: number) => {
                if (isSpinning.current) return;
                isSpinning.current = true;
                updateValue(delta);
                timeoutRef.current = setTimeout(() => {
                    intervalRef.current = setInterval(() => {
                        updateValue(delta);
                    }, 100);
                }, 800);
            },
            [updateValue]
        );

        const stopSpin = useCallback(() => {
            isSpinning.current = false;
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (intervalRef.current) clearInterval(intervalRef.current);
            timeoutRef.current = null;
            intervalRef.current = null;
        }, []);

        useEffect(() => {
            return () => stopSpin();
        }, [stopSpin]);

        return (
            <div className={`relative group ${className || ""}`}>
                <TextInput
                    {...props}
                    ref={innerRef}
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    onChange={onChange}
                    className="[&_input]:pr-8 [&_input]:appearance-none [&_input]:[-moz-appearance:textfield] [&_input::-webkit-inner-spin-button]:appearance-none [&_input::-webkit-outer-spin-button]:appearance-none"
                />
                <div className="absolute right-1 top-1 bottom-1 w-8 flex flex-col opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200">
                    <button
                        type="button"
                        tabIndex={-1}
                        className="flex-1 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 active:translate-y-px text-gray-500 dark:text-gray-400 rounded-t-md flex items-center justify-center focus:outline-none transition-all touch-none"
                        onMouseDown={(e) => {
                            if (ignoreMouseRef.current) return;
                            e.preventDefault(); // Prevent focus loss
                            e.stopPropagation();
                            startSpin(step);
                        }}
                        onMouseUp={stopSpin}
                        onMouseLeave={stopSpin}
                        onTouchStart={(e) => {
                            ignoreMouseRef.current = true;
                            e.preventDefault(); // Prevent scrolling/focus loss
                            e.stopPropagation();
                            startSpin(step);
                        }}
                        onTouchEnd={() => {
                            stopSpin();
                            // Reset ignore mouse after a delay to cover the ghost click
                            setTimeout(() => {
                                ignoreMouseRef.current = false;
                            }, 500);
                        }}
                    >
                        <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        tabIndex={-1}
                        className="flex-1 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 active:translate-y-px text-gray-500 dark:text-gray-400 rounded-b-md flex items-center justify-center focus:outline-none transition-all touch-none"
                        onMouseDown={(e) => {
                            if (ignoreMouseRef.current) return;
                            e.preventDefault(); // Prevent focus loss
                            e.stopPropagation();
                            startSpin(-step);
                        }}
                        onMouseUp={stopSpin}
                        onMouseLeave={stopSpin}
                        onTouchStart={(e) => {
                            ignoreMouseRef.current = true;
                            e.preventDefault(); // Prevent scrolling/focus loss
                            e.stopPropagation();
                            startSpin(-step);
                        }}
                        onTouchEnd={() => {
                            stopSpin();
                            // Reset ignore mouse after a delay to cover the ghost click
                            setTimeout(() => {
                                ignoreMouseRef.current = false;
                            }, 500);
                        }}
                    >
                        <ChevronDown className="w-4 h-4" />
                    </button>
                </div>
            </div>
        );
    }
);

NumberInput.displayName = "NumberInput";
