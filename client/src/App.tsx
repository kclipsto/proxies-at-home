import { Loader } from "./components/Loader";
import ProxyBuilderPage from "./pages/ProxyBuilderPage";

function App() {
  return (
    <div className="bg-gray-300">
      <h1 className="sr-only">Proxxied — MTG Proxy Builder and Print</h1>

      <Loader />

      <ProxyBuilderPage />
    </div>
  );
}

export default App;
