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
    ({ min, max, step = 1, className, ...props }, ref) => {
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
                if (props.onChange) {
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

                    props.onChange(syntheticEvent);
                }
            }
        }, [props.onChange]);

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

        const startSpin = useCallback(
            (delta: number) => {
                updateValue(delta);
                timeoutRef.current = setTimeout(() => {
                    intervalRef.current = setInterval(() => {
                        updateValue(delta);
                    }, 50);
                }, 500);
            },
            [updateValue]
        );

        const stopSpin = useCallback(() => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (intervalRef.current) clearInterval(intervalRef.current);
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
                    className="[&_input]:pr-8 [&_input::-webkit-inner-spin-button]:appearance-none [&_input::-webkit-outer-spin-button]:appearance-none"
                />
                <div className="absolute right-1 top-1 bottom-1 w-6 flex flex-col opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button
                        type="button"
                        tabIndex={-1}
                        className="flex-1 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 active:translate-y-px text-gray-500 dark:text-gray-400 rounded-t-md flex items-center justify-center focus:outline-none transition-all"
                        onMouseDown={(e) => {
                            e.preventDefault(); // Prevent focus loss
                            startSpin(step);
                        }}
                        onMouseUp={stopSpin}
                        onMouseLeave={stopSpin}
                    >
                        <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                        type="button"
                        tabIndex={-1}
                        className="flex-1 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 active:translate-y-px text-gray-500 dark:text-gray-400 rounded-b-md flex items-center justify-center focus:outline-none transition-all"
                        onMouseDown={(e) => {
                            e.preventDefault(); // Prevent focus loss
                            startSpin(-step);
                        }}
                        onMouseUp={stopSpin}
                        onMouseLeave={stopSpin}
                    >
                        <ChevronDown className="w-3 h-3" />
                    </button>
                </div>
            </div>
        );
    }
);

NumberInput.displayName = "NumberInput";
