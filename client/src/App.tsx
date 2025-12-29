import { Loader, UpdateNotification } from "@/components/common";
import { lazy } from "react";

const ProxyBuilderPage = lazy(() => import("@/pages/ProxyBuilderPage"));

function App() {
  return (
    <>
      <h1 className="sr-only">Proxxied — MTG Proxy Builder and Print</h1>

      <Loader />
      <UpdateNotification />

      <ProxyBuilderPage />
    </>
  );
}

export default App;
