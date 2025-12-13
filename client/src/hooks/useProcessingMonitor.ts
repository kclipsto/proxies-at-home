import { useEffect, useRef } from 'react';
import type { ImageProcessor } from '@/helpers/imageProcessor';
import { getCurrentSession, hasActiveSession } from '@/helpers/ImportSession';
import { useToastStore } from '@/store/toast';

/**
 * Monitors ImageProcessor to show/hide processing toast.
 * Import logging is handled by ImportSession.tryAutoFinish().
 */
export function useProcessingMonitor(imageProcessor: ImageProcessor) {
    const hadActiveSessionRef = useRef(false);

    useEffect(() => {
        const unsubscribe = imageProcessor.onActivityChange((isActive) => {
            if (isActive) {
                useToastStore.getState().showProcessingToast();
                hadActiveSessionRef.current = hasActiveSession();
                getCurrentSession()?.markProcessingStart();
            } else {
                useToastStore.getState().hideProcessingToast();
                if (hadActiveSessionRef.current) {
                    getCurrentSession()?.markProcessingComplete();
                }
                hadActiveSessionRef.current = false;
            }
        });
        return unsubscribe;
    }, [imageProcessor]);
}
