import { useRef, useState, useCallback, useEffect, useLayoutEffect } from "react";
import { usePinch, useDrag } from "@use-gesture/react";

interface UsePageViewZoomProps {
    zoom: number;
    setZoom: (zoom: number) => void;
    mobile?: boolean;
    active?: boolean;
    pageWidth: number;
    pageHeight: number;
}

export function usePageViewZoom({
    zoom,
    setZoom,
    mobile,
    active,
    pageWidth,
    pageHeight,
}: UsePageViewZoomProps) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const prevZoomRef = useRef(zoom);
    const lastCenterOffsetRef = useRef({ x: 0, y: 0 });
    const pinchState = useRef({ active: false, x: 0, y: 0 });
    const lastPinchPosRef = useRef({ x: 0, y: 0 });
    const [isPinching, setIsPinching] = useState(false);

    const updateCenterOffset = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const maxScrollTop = container.scrollHeight - container.clientHeight;
        const ratioY = maxScrollTop > 0 ? container.scrollTop / maxScrollTop : 0;

        lastCenterOffsetRef.current = {
            x: 0,
            y: ratioY,
        };
    }, []);

    useLayoutEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const prevZoom = prevZoomRef.current;
        if (prevZoom === zoom) return;

        // Mobile Pinch: Zoom about pinch center using relative movement.
        if (mobile && pinchState.current.active) {
            const { x: currX, y: currY } = pinchState.current;
            const { x: prevX, y: prevY } = lastPinchPosRef.current;
            const ratio = zoom / prevZoom;

            container.scrollLeft = (container.scrollLeft + prevX) * ratio - currX;
            container.scrollTop = (container.scrollTop + prevY) * ratio - currY;

            // Update last pinch pos for next frame
            lastPinchPosRef.current = { x: currX, y: currY };
        } else if (mobile) {
            // Mobile Fallback: Zoom about center.
            const cx = container.clientWidth / 2;
            const cy = container.clientHeight / 2;
            const ratio = zoom / prevZoom;

            container.scrollLeft = (container.scrollLeft + cx) * ratio - cx;
            container.scrollTop = (container.scrollTop + cy) * ratio - cy;
        } else {
            const { y: ratioY } = lastCenterOffsetRef.current;

            // Horizontal: Always center
            const targetScrollLeft = (container.scrollWidth - container.clientWidth) / 2;

            // Vertical: Maintain relative scroll percentage.
            const maxScrollTop = container.scrollHeight - container.clientHeight;
            const targetScrollTop = ratioY * maxScrollTop;

            container.scrollLeft = targetScrollLeft;
            container.scrollTop = targetScrollTop;
        }

        // Update the offset ref to match the new reality
        updateCenterOffset();

        prevZoomRef.current = zoom;
    }, [zoom, updateCenterOffset, mobile]);

    useEffect(() => {
        updateCenterOffset();
        window.addEventListener("resize", updateCenterOffset);
        return () => window.removeEventListener("resize", updateCenterOffset);
    }, [updateCenterOffset]);

    // Handle Pinch-to-Zoom on Mobile
    usePinch(
        ({ offset: [s], origin: [ox, oy], first, last, event }) => {
            if (event.type === 'wheel') return;

            if (first) {
                setIsPinching(true);
                pinchState.current.active = true;
                const container = scrollContainerRef.current;
                if (container) {
                    const rect = container.getBoundingClientRect();
                    const x = ox - rect.left;
                    const y = oy - rect.top;
                    lastPinchPosRef.current = { x, y };
                    pinchState.current.x = x;
                    pinchState.current.y = y;
                }
            }

            if (pinchState.current.active) {
                const container = scrollContainerRef.current;
                if (container) {
                    const rect = container.getBoundingClientRect();
                    pinchState.current.x = ox - rect.left;
                    pinchState.current.y = oy - rect.top;
                }
            }

            setZoom(s);

            if (last) {
                setTimeout(() => {
                    pinchState.current.active = false;
                    setIsPinching(false);
                }, 0);
            }
        },
        {
            target: document,
            scaleBounds: { min: 0.1, max: 5 },
            eventOptions: { passive: false, capture: true },
            from: () => [zoom, 0],
            rubberband: true,
            enabled: active,
        }
    );

    // Handle Shift+Drag to Zoom (for DevTools emulation / Desktop)
    useDrag(
        ({ movement: [, my], shiftKey, first, last, memo = zoom }) => {
            if (first && shiftKey) setIsPinching(true);
            if (last) setIsPinching(false);

            if (shiftKey) {
                const delta = my * -0.01;
                const newZoom = Math.min(Math.max(0.1, memo + delta), 5);
                setZoom(newZoom);
                return memo;
            }
            return memo;
        },
        {
            target: document,
            eventOptions: { passive: false, capture: true },
            enabled: active,
            pointer: { touch: false }, // Desktop only - suppress touch-action warning
        }
    );

    // Desktop: Center view logic
    useEffect(() => {
        if (mobile) return;

        const container = scrollContainerRef.current;
        if (!container) return;

        // Allow layout to update
        requestAnimationFrame(() => {
            const x = (container.scrollWidth - container.clientWidth) / 2;
            const y = (container.scrollHeight - container.clientHeight) / 2;
            container.scrollTo(x, y);

            // Update the center offset ref so subsequent zooms are correct
            updateCenterOffset();
        });
    }, [pageWidth, pageHeight, updateCenterOffset, mobile]);

    return {
        scrollContainerRef,
        isPinching,
        updateCenterOffset,
    };
}
