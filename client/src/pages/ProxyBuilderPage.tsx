import { PageSettingsControls } from "../components/PageSettingsControls";
import { PageView } from "../components/PageView";
import { UploadSection } from "../components/UploadSection";

export default function ProxyBuilderPage() {
  return (
    <div className="flex flex-row h-screen justify-between overflow-hidden">
      <UploadSection />

      <PageView />

      <PageSettingsControls />
    </div>
  );
}
