import { Loader } from "./components/Loader";
import ProxyBuilderPage from "./pages/ProxyBuilderPage";

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
