import { Button } from "flowbite-react";
import { useState, useEffect } from "react";

type LoadingOverlayProps = {
  task: string;
  progress: number;
  onCancel: (() => void) | null;
};

export default function LoadingOverlay({ task, progress, onCancel }: LoadingOverlayProps) {
  const [startTime] = useState(performance.now());
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(performance.now() - startTime);
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes > 0 ? `${minutes}m ` : ''}${remainingSeconds}s`;
  };

  return (
    <div className="fixed rounded-xl inset-0 z-50 bg-gray-900/50 flex items-center justify-center">
      {" "}
      <div className="bg-white dark:bg-gray-800 p-6 rounded shadow-md w-96 text-center">
        <div className="mb-4 text-lg font-semibold text-gray-800 dark:text-white">
          {task}
        </div>
        <div className="w-full h-4 bg-gray-300 dark:bg-gray-700 rounded overflow-hidden relative">
          {progress >= 0 ? (
            <>
              <div
                className="h-full bg-green-500 transition-all duration-150"
                style={{ width: `${progress}%` }}
              />
              <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-800 dark:text-gray-200 font-bold">
                {Math.round(progress)}%
              </div>
            </>
          ) : (
            <div
              className="h-full animate-sheen"
              style={{ width: "100%" }}
            />
          )}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Elapsed: {formatTime(elapsedTime)}
          </div>
          {onCancel && (
            <Button color="light" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
