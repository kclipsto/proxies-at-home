import { useLoadingStore } from "../store";
import LoadingOverlay from "./LoadingOverlay";

export function Loader() {
  const loadingTask = useLoadingStore((state) => state.loadingTask);
  const progress = useLoadingStore((state) => state.progress);
  const onCancel = useLoadingStore((state) => state.onCancel);

  if (loadingTask === null) {
    return null;
  }

  return <LoadingOverlay task={loadingTask} progress={progress} onCancel={onCancel} />;
}
