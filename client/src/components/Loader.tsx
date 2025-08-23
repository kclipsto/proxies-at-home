import { useLoadingStore } from "../store";
import LoadingOverlay from "./LoadingOverlay";

export function Loader() {
  const loadingTask = useLoadingStore((state) => state.loadingTask);

  if (loadingTask === null) {
    return null;
  }

  return <LoadingOverlay task={loadingTask} />;
}
