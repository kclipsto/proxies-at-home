import { useDrag } from "@use-gesture/react";
import { animated, useSpring } from "@react-spring/web";

import { type ReactNode, useState, forwardRef, useEffect } from "react";

type Props = {
    children: ReactNode;
    disabled?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

export const PullToRefresh = forwardRef<HTMLDivElement, Props>(({ children, className, style, onScroll, disabled, ...props }, ref) => {
    const [loading, setLoading] = useState(false);
    const [ready, setReady] = useState(false);

    const [{ y }, api] = useSpring(() => ({ y: 0 }));

    const TRIGGER_THRESHOLD = 180;
    const CANCEL_THRESHOLD = 140; // Hysteresis: stay ready until pulled back below this
    const RESISTANCE = 0.5;

    const bind = useDrag(
        ({ down, movement: [, my], currentTarget, canceled, cancel, event, first, memo = 0 }) => {
            if (disabled) {
                cancel();
                return memo;
            }

            // Disable for mouse events (desktop UX)
            // Check both pointerType (for pointer events) and type (fallback for touch/mouse events)
            const isMouse = (event as PointerEvent).pointerType === 'mouse' || event.type.startsWith('mouse');
            if (isMouse) return;

            // Check for multi-touch (pinch) to prevent conflict with zoom
            // @ts-expect-error - touches property exists on TouchEvent
            if (event.touches && event.touches.length > 1) {
                cancel();
                return memo;
            }

            // Check for Shift key (DevTools pinch emulation)
            if (event.shiftKey) {
                cancel();
                return memo;
            }

            if (loading) return;

            // Check scroll position of the element itself
            const element = currentTarget as HTMLElement;

            // Capture initial scroll position at the start of the gesture
            if (first) {
                memo = element.scrollTop;
            }

            // Calculate effective pull distance (subtracting the distance used to scroll to top)
            const effectiveY = my - memo;

            // If gesture is canceled, reset everything
            if (canceled) {
                setReady(false);
                api.start({ y: 0 });
                return memo;
            }

            // Only engage if we are at the top and have pulled enough to overcome initial scroll
            if (element.scrollTop <= 0 && effectiveY > 0) {
                if (down) {
                    // Update ready state with hysteresis
                    if (effectiveY > TRIGGER_THRESHOLD && !ready) setReady(true);
                    if (effectiveY < CANCEL_THRESHOLD && ready) setReady(false);

                    // Resistance effect
                    api.start({ y: Math.min(effectiveY * RESISTANCE, 150), immediate: true });
                } else {
                    if (ready) {
                        // Trigger refresh
                        setLoading(true);
                        api.start({ y: 60 }); // Keep loader visible
                        window.location.reload();
                    } else {
                        // Reset
                        setReady(false);
                        api.start({ y: 0 });
                    }
                }
            } else {
                // Not at top or not pulled enough, ensure reset
                if (ready) setReady(false);
                api.start({ y: 0 });
            }

            return memo;
        },
        {
            axis: "y",
            // target: window, // Removed to fix scroll blocking
            eventOptions: { passive: false },
            from: () => [0, y.get()],
            filterTaps: true,
            pointer: { touch: true }, // Ensure touch events are handled
        }
    );

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (onScroll) onScroll(e);

        // If we are scrolled down, ensure the refresh mechanism is reset
        if (e.currentTarget.scrollTop > 0) {
            if (ready) setReady(false);
            if (y.get() > 0) api.start({ y: 0 });
        }
    };

    // Haptic feedback when ready state changes
    useEffect(() => {
        if (ready && navigator.vibrate) {
            try {
                navigator.vibrate(50);
            } catch {
                // Ignore errors if vibration is blocked
            }
        }
    }, [ready]);

    return (
        <div
            ref={ref}
            {...bind()}
            className={`h-full overflow-y-auto touch-pan-y overscroll-y-none relative ${className || ''}`}
            style={style}
            onScroll={handleScroll}
            {...props}
        >
            <animated.div
                style={{
                    y: y.to(val => val / 2 + 40), // Center in the gap (40 is half of h-20/80px, +val/2 centers it)
                    opacity: y.to(val => Math.min(val / 60, 1))
                }}
                className="absolute top-0 left-0 w-full flex flex-col justify-center -mt-20 h-20 items-center pointer-events-none z-0"
            >
                <animated.img
                    src="/logo.svg"
                    alt="Refresh"
                    className="w-8 h-8 object-contain mb-2"
                    style={{
                        transform: y.to(val => {
                            const rotation = Math.min(val * 3, 360); // Full rotation at y=120 (well before trigger)
                            const scale = 1 + Math.min(val / 90, 1) * 0.05; // Grow by 5% max
                            return `rotate(${rotation}deg) scale(${scale})`;
                        }),
                        opacity: y.to(val => Math.min(val / 60, 1))
                    }}
                />
                <span className={`text-xs font-medium transition-all duration-200 ${ready ? 'text-green-500 font-bold scale-110' : 'text-gray-500 dark:text-gray-400'}`}>
                    {ready ? "Release to Refresh" : "Pull to Refresh"}
                </span>
            </animated.div>

            <animated.div
                style={{ y }}
                className="min-h-full w-full flex flex-col relative z-10"
            >
                {children}
            </animated.div>
        </div>
    );
});
