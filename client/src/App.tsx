import { Loader, UpdateNotification, AboutModal } from "@/components/common";
import { lazy, useEffect, useState } from "react";
import { ImageProcessor } from "@/helpers/imageProcessor";
import { useShareUrl } from "@/hooks/useShareUrl";

import { db } from "@/db";
import { useProjectStore, useUserPreferencesStore } from "@/store";

const ProxyBuilderPage = lazy(() => import("@/pages/ProxyBuilderPage"));

function App() {
  const [showAbout, setShowAbout] = useState(false);

  // Detect and load shared deck from ?share=xxx URL parameter
  useShareUrl();

  // Initialize Project Store
  useEffect(() => {
    let isCancelled = false;

    const initProject = async () => {
      // Check if already initialized to prevent race condition
      const existingProjectId = useProjectStore.getState().currentProjectId;
      if (existingProjectId) return;

      // 1. Load stores first
      await useProjectStore.getState().loadProjects();
      await useUserPreferencesStore.getState().load();

      // Double-check after async load (race condition guard)
      if (isCancelled || useProjectStore.getState().currentProjectId) return;

      const { projects } = useProjectStore.getState();

      // 2. Ensure userPreferences record exists
      let userPrefs = await db.userPreferences.get('default');
      if (!userPrefs) {
        await db.userPreferences.add({
          id: 'default',
          settings: {},
          favoriteCardbacks: [],
        });
        userPrefs = await db.userPreferences.get('default');
      }

      // 3. Determine which project to load
      let targetProjectId: string | undefined;

      // Priority 1: Last opened project (if it still exists)
      if (userPrefs?.lastProjectId) {
        const exists = projects.find(p => p.id === userPrefs!.lastProjectId);
        if (exists) {
          targetProjectId = userPrefs.lastProjectId;
        }
      }

      // Priority 2: First available project
      if (!targetProjectId && projects.length > 0) {
        targetProjectId = projects[0].id;
      }

      // Priority 3: Create new project (only if truly empty)
      if (!targetProjectId) {
        // Final guard - check one more time before creating
        if (isCancelled) return;
        targetProjectId = await useProjectStore.getState().createProject('My Project');
      }

      // 4. Switch to target project
      if (!isCancelled) {
        await useProjectStore.getState().switchProject(targetProjectId);
      }
    };

    initProject();

    return () => { isCancelled = true; };
  }, []);


  // Listen for Electron "About" menu click and settings button click
  useEffect(() => {
    // Electron menu handler
    if (window.electronAPI?.onShowAbout) {
      window.electronAPI.onShowAbout(() => {
        setShowAbout(true);
      });
    }

    // Settings button handler (works in web and Electron)
    const handleOpenAbout = () => setShowAbout(true);
    window.addEventListener('open-about-modal', handleOpenAbout);

    // Pre-warm workers
    ImageProcessor.getInstance().prewarm();

    return () => window.removeEventListener('open-about-modal', handleOpenAbout);
  }, []);

  return (
    <>
      <h1 className="sr-only">Proxxied — MTG Proxy Builder and Print</h1>

      <Loader />
      <UpdateNotification />
      <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />

      <ProxyBuilderPage />
    </>
  );
}

export default App;

