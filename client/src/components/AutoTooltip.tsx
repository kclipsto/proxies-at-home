import { Tooltip, type TooltipProps } from "flowbite-react";
import { useState, useRef, useEffect } from "react";
import { HelpCircle } from "lucide-react";

interface AutoTooltipProps extends TooltipProps {
    mobile?: boolean;
    timeout?: number;
    className?: string; // Used for the default HelpCircle icon
    tooltipClassName?: string; // Used for the tooltip container/bubble
}

export function AutoTooltip({ mobile, timeout = 2000, children, className = "w-4 h-4 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 cursor-pointer", tooltipClassName, ...props }: AutoTooltipProps) {
    const [mounted, setMounted] = useState(false);
    const [show, setShow] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const unmountTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Cleanup timeouts on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (unmountTimeoutRef.current) clearTimeout(unmountTimeoutRef.current);
        };
    }, []);

    const content = children || <HelpCircle className={className} />;

    if (!mobile) {
        return <Tooltip className={tooltipClassName} {...props}>{content}</Tooltip>;
    }

    const handleClick = () => {
        // Clear existing timeouts
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (unmountTimeoutRef.current) clearTimeout(unmountTimeoutRef.current);

        setMounted(true);
        // Small delay to ensure mount happens before opacity transition
        requestAnimationFrame(() => {
            setShow(true);
        });

        timeoutRef.current = setTimeout(() => {
            setShow(false);
            // Wait for transition to finish before unmounting
            unmountTimeoutRef.current = setTimeout(() => {
                setMounted(false);
            }, 300); // Match transition duration
        }, timeout);
    };

    const getPositionClasses = () => {
        switch (props.placement) {
            case 'left':
                return 'top-1/2 right-full mr-2 transform -translate-y-1/2';
            case 'right':
                return 'top-1/2 left-full ml-2 transform -translate-y-1/2';
            case 'bottom':
                return 'top-full left-1/2 mt-2 transform -translate-x-1/2';
            case 'bottom-end':
                return 'top-full right-0 mt-2';
            case 'top':
            default:
                return 'bottom-full left-1/2 mb-2 transform -translate-x-1/2';
        }
    };

    const getArrowClasses = () => {
        const base = "absolute w-2 h-2 bg-gray-900 dark:bg-gray-700 transform rotate-45";
        switch (props.placement) {
            case 'left':
                return `${base} -right-1 top-1/2 -translate-y-1/2`;
            case 'right':
                return `${base} -left-1 top-1/2 -translate-y-1/2`;
            case 'bottom':
                return `${base} -top-1 left-1/2 -translate-x-1/2`;
            case 'bottom-end':
                return `${base} -top-1 right-3`;
            case 'top':
            default:
                return `${base} -bottom-1 left-1/2 -translate-x-1/2`;
        }
    };

    return (
        <div className="relative inline-flex" onClick={handleClick}>
            {content}
            {mounted && (
                <div
                    role="tooltip"
                    className={`absolute z-50 px-3 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg whitespace-nowrap dark:bg-gray-700 transition-opacity duration-300 ${getPositionClasses()} ${show ? 'opacity-100' : 'opacity-0'} ${tooltipClassName || ''}`}
                >
                    {props.content}
                    <div className={getArrowClasses()} data-testid="flowbite-tooltip-arrow" />
                </div>
            )}
        </div>
    );
}
