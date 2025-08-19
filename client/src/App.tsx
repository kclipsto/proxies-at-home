import ProxyBuilderPage from "./pages/ProxyBuilderPage";
import { PageSettingsProvider as PageSettingsProvider } from "./providers/PageSettings";

function App() {
  return (
    <div className="bg-gray-300">
      <PageSettingsProvider>
        <ProxyBuilderPage />
      </PageSettingsProvider>
    </div>
  );
}

export default App;
