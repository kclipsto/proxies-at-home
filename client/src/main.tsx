import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { LoadingScreen } from "./components/LoadingScreen";

// Unregister any existing service workers
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
    }
  });
}

// Prevent browser zoom globally - app handles its own zoom
// Ctrl+scroll (wheel with ctrlKey)
document.addEventListener('wheel', (e) => {
  if (e.ctrlKey) {
    e.preventDefault();
  }
}, { passive: false });

// Ctrl+/- and Ctrl+0 keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '0')) {
    e.preventDefault();
  }
});

const App = lazy(() => import("./App"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  // StrictMode disabled: PixiJS/WebGL has compatibility issues with double-invocation in Chrome.
  // This only affects development mode - production builds are unaffected.
  <React.StrictMode>
    <Suspense fallback={<div className="h-[100dvh]"><LoadingScreen /></div>}>
      <App />
    </Suspense>
  </React.StrictMode>
);
