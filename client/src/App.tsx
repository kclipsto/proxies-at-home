import { Loader, UpdateNotification, AboutModal } from "@/components/common";
import { lazy, useEffect, useState } from "react";

const ProxyBuilderPage = lazy(() => import("@/pages/ProxyBuilderPage"));

function App() {
  const [showAbout, setShowAbout] = useState(false);

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
