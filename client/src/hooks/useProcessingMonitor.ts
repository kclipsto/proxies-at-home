import { useEffect, useRef } from 'react';
import type { ImageProcessor } from '@/helpers/imageProcessor';
import { getEffectProcessor } from '@/helpers/effectCache';
import { getCurrentSession, hasActiveSession } from '@/helpers/importSession';
import { useToastStore } from '@/store/toast';

/**
 * Monitors ImageProcessor and EffectProcessor to show/hide processing toast.
 * Import logging is handled by ImportSession.tryAutoFinish().
 */
export function useProcessingMonitor(imageProcessor: ImageProcessor) {
    const hadActiveSessionRef = useRef(false);
    // Track activity from both processors
    const imageActiveRef = useRef(false);
    const effectActiveRef = useRef(false);

    const updateToast = () => {
        const isActive = imageActiveRef.current || effectActiveRef.current;
        if (isActive) {
            useToastStore.getState().showProcessingToast();
        } else {
            useToastStore.getState().hideProcessingToast();
        }
    };

    useEffect(() => {
        const unsubscribeImage = imageProcessor.onActivityChange((isActive) => {
            imageActiveRef.current = isActive;
            updateToast();

            if (isActive) {
                hadActiveSessionRef.current = hasActiveSession();
                getCurrentSession()?.markProcessingStart();
            } else if (hadActiveSessionRef.current && !effectActiveRef.current) {
                getCurrentSession()?.markProcessingComplete();
                hadActiveSessionRef.current = false;
            }
        });

        const effectProcessor = getEffectProcessor();
        const unsubscribeEffect = effectProcessor.onActivityChange((isActive) => {
            effectActiveRef.current = isActive;
            updateToast();
        });

        return () => {
            unsubscribeImage();
            unsubscribeEffect();
        };
    }, [imageProcessor]);
}
