import { Loader } from "./components/Loader";
import { lazy } from "react";

const ProxyBuilderPage = lazy(() => import("./pages/ProxyBuilderPage"));

function App() {
  return (
    <>
      <h1 className="sr-only">Proxxied — MTG Proxy Builder and Print</h1>

      <Loader />

      <ProxyBuilderPage />
    </>
  );
}

export default App;
