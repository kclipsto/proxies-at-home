import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

// Unregister any existing service workers
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
    }
  });
}

const App = lazy(() => import("./App"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={
      <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="relative flex items-center justify-center">
          <div className="absolute w-40 h-40 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <img src="/logo.svg" alt="Proxxied" className="w-24 h-24 animate-pulse" />
        </div>
      </div>
    }>
      <App />
    </Suspense>
  </React.StrictMode>
);
