import React, { useEffect } from "react";
import { useOnScreen } from "../hooks/useOnScreen";
import type { CardOption } from "../types/Card";

type Props = {
  card: CardOption;
  state: "idle" | "loading" | "error" | undefined;
  hasImage: boolean;
  ensureProcessed: (card: CardOption) => Promise<void>;
  children: React.ReactNode;
};

export default function CardCellLazy({
  card,
  state,
  hasImage,
  ensureProcessed,
  children,
}: Props) {
  const { ref, visible } = useOnScreen<HTMLDivElement>("400px");

  useEffect(() => {
    if (visible) void ensureProcessed(card);
  }, [visible, card, ensureProcessed]);

  return (
    <div ref={ref} className="relative">
      {!hasImage && state !== "error" && (
        <div className="absolute inset-0 grid place-items-center z-10">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-transparent" />
        </div>
      )}
      {state === "error" && !hasImage && (
        <div className="absolute inset-0 grid place-items-center z-10">
          <div className="px-2 py-1 text-xs bg-red-600 text-white rounded">
            load failed — click to retry
          </div>
        </div>
      )}
      <div
        onClick={() => {
          if (state === "error") void ensureProcessed(card);
        }}
      >
        {children}
      </div>
    </div>
  );
}
