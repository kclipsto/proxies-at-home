import { useEffect, type Dispatch, type SetStateAction } from "react";

type UseZoomShortcutsProps = {
    setZoom: Dispatch<SetStateAction<number>>;
    isOpen: boolean;
    minZoom?: number;
    maxZoom?: number;
    step?: number;
    // Optional ref to attach wheel listener to specific element instead of window
    targetRef?: React.RefObject<HTMLElement>;
};

export function useZoomShortcuts({
    setZoom,
    isOpen,
    minZoom = 0.1,
    maxZoom = 5,
    step = 0.1,
    targetRef,
}: UseZoomShortcutsProps) {
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === "=" || e.key === "+") {
                    e.preventDefault();
                    setZoom((z) => {
                        const next = Math.min(maxZoom, z + step);
                        return parseFloat(next.toFixed(1)); // avoid FP errors
                    });
                } else if (e.key === "-") {
                    e.preventDefault();
                    setZoom((z) => {
                        const next = Math.max(minZoom, z - step);
                        return parseFloat(next.toFixed(1));
                    });
                } else if (e.key === "0") {
                    e.preventDefault();
                    setZoom(1);
                }
            }
        };

        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                // Wheel Up (negative deltaY) -> Zoom In
                const direction = -Math.sign(e.deltaY);
                const delta = direction * step;

                setZoom((z) => {
                    const next = Math.min(maxZoom, Math.max(minZoom, z + delta));
                    return parseFloat(next.toFixed(1));
                });
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        const wheelTarget = targetRef?.current || window;
        wheelTarget.addEventListener("wheel", handleWheel as EventListener, { passive: false });

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            wheelTarget.removeEventListener("wheel", handleWheel as EventListener);
        };
    }, [isOpen, setZoom, minZoom, maxZoom, step, targetRef]);
}
