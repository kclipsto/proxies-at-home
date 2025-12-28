/**
 * PixiJS Application Singleton Management
 * 
 * Manages a single PixiJS Application instance that persists across component lifecycles.
 * This is necessary because WebGL context creation is expensive and PixiJS doesn't handle
 * hot reload well.
 */

import { Application, Container } from 'pixi.js';

// --- Singleton State ---
interface PixiSingletonState {
    app: Application | null;
    canvas: HTMLCanvasElement | null;
    worldContainer: Container | null;
    pagesContainer: Container | null;
    pageGuidesContainer: Container | null;
    cardsContainer: Container | null;
    guidesContainer: Container | null;
    initPromise: Promise<void> | null;
    isInitializing: boolean;
}

export const pixiSingleton: PixiSingletonState = {
    app: null,
    canvas: null,
    worldContainer: null,
    pagesContainer: null,
    pageGuidesContainer: null,
    cardsContainer: null,
    guidesContainer: null,
    initPromise: null,
    isInitializing: false,
};

/**
 * Fully reset the singleton - destroys app and clears all references.
 * Use for cleanup or when forcing a fresh WebGL context.
 */
export function resetPixiSingleton(): void {
    if (pixiSingleton.app) {
        try {
            pixiSingleton.app.ticker?.stop();
            // Destroy with all cleanup options per PixiJS docs
            pixiSingleton.app.destroy(true, {
                children: true,
                texture: true,
                textureSource: true,
            });
        } catch (e) {
            console.warn('[PixiSingleton] Error during cleanup:', e);
        }
    }
    pixiSingleton.app = null;
    pixiSingleton.canvas = null;
    pixiSingleton.worldContainer = null;
    pixiSingleton.pagesContainer = null;
    pixiSingleton.pageGuidesContainer = null;
    pixiSingleton.cardsContainer = null;
    pixiSingleton.guidesContainer = null;
    pixiSingleton.initPromise = null;
    pixiSingleton.isInitializing = false;
}



// Export for PixiCardPreview to access
let pixiApp: Application | null = null;

export function setPixiApp(app: Application | null): void {
    pixiApp = app;
}

export function getPixiApp(): Application | null {
    return pixiApp;
}

// Force full page reload on HMR for this module
// PixiJS/WebGL doesn't handle hot reload well - cleaner to just reload
if (import.meta.hot) {
    import.meta.hot.accept(() => {
        import.meta.hot!.invalidate();
    });
}
