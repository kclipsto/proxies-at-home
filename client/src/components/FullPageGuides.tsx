import { memo } from "react";
import { useSettingsStore } from "../store";

type Props = {
  totalCardWidthMm: number;
  totalCardHeightMm: number;
  baseCardWidthMm: number;
  baseCardHeightMm: number;
  bleedEdgeWidthMm: number;
  cardCount: number;
};

const EdgeCutLines = memo(function EdgeCutLines({
  totalCardWidthMm,
  totalCardHeightMm,
  baseCardWidthMm,
  baseCardHeightMm,
  bleedEdgeWidthMm,
  cardCount,
}: Props) {
  const guideWidth = useSettingsStore((state) => state.guideWidth);
  const pageSizeUnit = useSettingsStore((state) => state.pageSizeUnit);
  const pageWidth = useSettingsStore((state) => state.pageWidth);
  const pageHeight = useSettingsStore((state) => state.pageHeight);
  const columns = useSettingsStore((state) => state.columns);
  const rows = useSettingsStore((state) => state.rows);
  const cardSpacingMm = useSettingsStore((state) => state.cardSpacingMm);
  const cardPositionX = useSettingsStore((state) => state.cardPositionX);
  const cardPositionY = useSettingsStore((state) => state.cardPositionY);
  const cutLineStyle = useSettingsStore((state) => state.cutLineStyle);

  if (cutLineStyle === "none" || guideWidth <= 0) return null;

  const pageWidthMm = pageSizeUnit === "mm" ? pageWidth : pageWidth * 25.4;
  const pageHeightMm = pageSizeUnit === "mm" ? pageHeight : pageHeight * 25.4;

  const gridWidthMm =
    columns * totalCardWidthMm + Math.max(0, columns - 1) * cardSpacingMm;
  const gridHeightMm =
    rows * totalCardHeightMm + Math.max(0, rows - 1) * cardSpacingMm;

  const startXmm = (pageWidthMm - gridWidthMm) / 2 + cardPositionX;
  const startYmm = (pageHeightMm - gridHeightMm) / 2 + cardPositionY;

  const cutInX = bleedEdgeWidthMm;
  const cutOutX = bleedEdgeWidthMm + baseCardWidthMm;
  const cutInY = bleedEdgeWidthMm;
  const cutOutY = bleedEdgeWidthMm + baseCardHeightMm;

  // Determine occupied rows and columns
  const occupiedCols = new Set<number>();
  const occupiedRows = new Set<number>();
  for (let i = 0; i < cardCount; i++) {
    occupiedCols.add(i % columns);
    occupiedRows.add(Math.floor(i / columns));
  }

  // Collect all vertical/horizontal cut positions
  const xCuts = new Set<number>();
  for (let c = 0; c < columns; c++) {
    if (occupiedCols.has(c)) {
      const cellLeft = startXmm + c * (totalCardWidthMm + cardSpacingMm);
      xCuts.add(cellLeft + cutInX);
      xCuts.add(cellLeft + cutOutX);
    }
  }
  const yCuts = new Set<number>();
  for (let r = 0; r < rows; r++) {
    if (occupiedRows.has(r)) {
      const cellTop = startYmm + r * (totalCardHeightMm + cardSpacingMm);
      yCuts.add(cellTop + cutInY);
      yCuts.add(cellTop + cutOutY);
    }
  }

  // Guide width is in CSS pixels
  const guideWidthPx = Math.max(1, Math.round(guideWidth));

  const els: React.ReactElement[] = [];
  // Re-calculate cuts with direction
  const xCutsMap = new Map<number, 'left' | 'right' | 'both'>();
  for (let c = 0; c < columns; c++) {
    if (occupiedCols.has(c)) {
      const cellLeft = startXmm + c * (totalCardWidthMm + cardSpacingMm);
      const leftCut = cellLeft + cutInX;
      const rightCut = cellLeft + cutOutX;

      // Left cut (left edge of card content) -> grow left
      xCutsMap.set(leftCut, xCutsMap.get(leftCut) === 'right' ? 'both' : 'left');

      // Right cut (right edge of card content) -> grow right
      xCutsMap.set(rightCut, xCutsMap.get(rightCut) === 'left' ? 'both' : 'right');
    }
  }

  [...xCutsMap.entries()].forEach(([x, type], i) => {
    const drawLine = (offsetPx: number) => {
      if (cutLineStyle === "full") {
        els.push(
          <div
            key={`v-${i}-${offsetPx}`}
            style={{
              position: "absolute",
              left: `calc(${x}mm + ${offsetPx}px)`,
              top: 0,
              width: `${guideWidthPx}px`,
              height: `${pageHeightMm}mm`,
              backgroundColor: "black",
              pointerEvents: "none",
            }}
          />
        );
      } else {
        // Edges only
        if (startYmm > 0) {
          els.push(
            <div
              key={`v-top-${i}-${offsetPx}`}
              style={{
                position: "absolute",
                left: `calc(${x}mm + ${offsetPx}px)`,
                top: 0,
                width: `${guideWidthPx}px`,
                height: `${startYmm}mm`,
                backgroundColor: "black",
                pointerEvents: "none",
              }}
            />
          );
        }
        const botStubStart = startYmm + gridHeightMm;
        const botStubH = pageHeightMm - botStubStart;
        if (botStubH > 0) {
          els.push(
            <div
              key={`v-bot-${i}-${offsetPx}`}
              style={{
                position: "absolute",
                left: `calc(${x}mm + ${offsetPx}px)`,
                top: `${botStubStart}mm`,
                width: `${guideWidthPx}px`,
                height: `${botStubH}mm`,
                backgroundColor: "black",
                pointerEvents: "none",
              }}
            />
          );
        }
      }
    };

    if (type === 'left' || type === 'both') {
      drawLine(-guideWidthPx); // Grow left
    }
    if (type === 'right' || type === 'both') {
      drawLine(0); // Grow right
    }
  });

  // Horizontal cuts
  const yCutsMap = new Map<number, 'top' | 'bottom' | 'both'>();
  for (let r = 0; r < rows; r++) {
    if (occupiedRows.has(r)) {
      const cellTop = startYmm + r * (totalCardHeightMm + cardSpacingMm);
      const topCut = cellTop + cutInY;
      const botCut = cellTop + cutOutY;

      yCutsMap.set(topCut, yCutsMap.get(topCut) === 'bottom' ? 'both' : 'top');
      yCutsMap.set(botCut, yCutsMap.get(botCut) === 'top' ? 'both' : 'bottom');
    }
  }

  [...yCutsMap.entries()].forEach(([y, type], i) => {
    const drawLine = (offsetPx: number) => {
      if (cutLineStyle === "full") {
        els.push(
          <div
            key={`h-${i}-${offsetPx}`}
            style={{
              position: "absolute",
              top: `calc(${y}mm + ${offsetPx}px)`,
              left: 0,
              height: `${guideWidthPx}px`,
              width: `${pageWidthMm}mm`,
              backgroundColor: "black",
              pointerEvents: "none",
            }}
          />
        );
      } else {
        if (startXmm > 0) {
          els.push(
            <div
              key={`h-left-${i}-${offsetPx}`}
              style={{
                position: "absolute",
                top: `calc(${y}mm + ${offsetPx}px)`,
                left: 0,
                height: `${guideWidthPx}px`,
                width: `${startXmm}mm`,
                backgroundColor: "black",
                pointerEvents: "none",
              }}
            />
          );
        }
        const rightStubStart = startXmm + gridWidthMm;
        const rightStubW = pageWidthMm - rightStubStart;
        if (rightStubW > 0) {
          els.push(
            <div
              key={`h-right-${i}-${offsetPx}`}
              style={{
                position: "absolute",
                top: `calc(${y}mm + ${offsetPx}px)`,
                left: `${rightStubStart}mm`,
                height: `${guideWidthPx}px`,
                width: `${rightStubW}mm`,
                backgroundColor: "black",
                pointerEvents: "none",
              }}
            />
          );
        }
      }
    };

    if (type === 'top' || type === 'both') {
      drawLine(-guideWidthPx); // Grow up
    }
    if (type === 'bottom' || type === 'both') {
      drawLine(0); // Grow down
    }
  });

  return <>{els}</>;
});

export default EdgeCutLines;
