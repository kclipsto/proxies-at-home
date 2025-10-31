import { Button } from "flowbite-react";

type LoadingOverlayProps = {
  task: string;
  progress: number;
  onCancel: (() => void) | null;
};

export default function LoadingOverlay({ task, progress, onCancel }: LoadingOverlayProps) {
  return (
    <div className="fixed rounded-xl inset-0 z-50 bg-gray-900/50 flex items-center justify-center">
      {" "}
      <div className="bg-white dark:bg-gray-800 p-6 rounded shadow-md w-96 text-center">
        <div className="mb-4 text-lg font-semibold text-gray-800 dark:text-white">
          {task}
        </div>
        <div className="w-full h-4 bg-gray-300 dark:bg-gray-700 rounded overflow-hidden relative">
          <div
            className="h-full bg-green-500 transition-all duration-150"
            style={{ width: `${progress}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-800 dark:text-gray-200 font-bold">
            {Math.round(progress)}%
          </div>
        </div>
        {onCancel && (
          <div className="mt-4 flex justify-end">
            <Button color="light" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
