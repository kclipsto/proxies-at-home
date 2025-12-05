import { lazy, Suspense } from "react";
import { Loader } from "./components/Loader";
import { UpdateNotification } from "./components/UpdateNotification";
import { Toaster } from "react-hot-toast";

const ProxyBuilderPage = lazy(() => import("./pages/ProxyBuilderPage"));

function App() {
  return (
    <>
      <h1 className="sr-only">Proxxied — MTG Proxy Builder and Print</h1>

      <Loader />
      <UpdateNotification />
      <Toaster position="bottom-center" />

      <Suspense fallback={null}>
        <ProxyBuilderPage />
      </Suspense>
    </>
  );
}

export default App;
