import { memo } from "react";
import { useSettingsStore } from "../store";

type CardLayoutInfo = {
  cardWidthMm: number;
  cardHeightMm: number;
  bleedMm: number;
};

type Props = {
  cardLayouts: CardLayoutInfo[];
  colWidths: number[];
  rowHeights: number[];
  baseCardWidthMm: number;
  baseCardHeightMm: number;
};

const EdgeCutLines = memo(function EdgeCutLines({
  cardLayouts,
  colWidths,
  rowHeights,
  baseCardWidthMm,
  baseCardHeightMm,
}: Props) {
  const guideWidth = useSettingsStore((state) => state.guideWidth);
  const pageSizeUnit = useSettingsStore((state) => state.pageSizeUnit);
  const pageWidth = useSettingsStore((state) => state.pageWidth);
  const pageHeight = useSettingsStore((state) => state.pageHeight);
  const columns = useSettingsStore((state) => state.columns);
  const cardSpacingMm = useSettingsStore((state) => state.cardSpacingMm);
  const cardPositionX = useSettingsStore((state) => state.cardPositionX);
  const cardPositionY = useSettingsStore((state) => state.cardPositionY);
  const cutLineStyle = useSettingsStore((state) => state.cutLineStyle);

  if (cutLineStyle === "none" || guideWidth <= 0 || cardLayouts.length === 0) return null;

  const pageWidthMm = pageSizeUnit === "mm" ? pageWidth : pageWidth * 25.4;
  const pageHeightMm = pageSizeUnit === "mm" ? pageHeight : pageHeight * 25.4;

  // Calculate grid dimensions from per-column/row sizes
  const gridWidthMm = colWidths.reduce((sum, w) => sum + w, 0) + Math.max(0, colWidths.length - 1) * cardSpacingMm;
  const gridHeightMm = rowHeights.reduce((sum, h) => sum + h, 0) + Math.max(0, rowHeights.length - 1) * cardSpacingMm;

  const startXmm = (pageWidthMm - gridWidthMm) / 2 + cardPositionX;
  const startYmm = (pageHeightMm - gridHeightMm) / 2 + cardPositionY;

  const guideWidthPx = Math.max(1, Math.round(guideWidth));

  const els: React.ReactElement[] = [];

  // Build maps to track cut positions with direction
  const xCutsMap = new Map<number, 'left' | 'right' | 'both'>();
  const yCutsMap = new Map<number, 'top' | 'bottom' | 'both'>();

  // Compute column start positions
  const colStarts: number[] = [];
  let xPos = startXmm;
  for (let c = 0; c < colWidths.length; c++) {
    colStarts.push(xPos);
    xPos += colWidths[c] + cardSpacingMm;
  }

  // Compute row start positions
  const rowStarts: number[] = [];
  let yPos = startYmm;
  for (let r = 0; r < rowHeights.length; r++) {
    rowStarts.push(yPos);
    yPos += rowHeights[r] + cardSpacingMm;
  }

  // Process each card to compute cut positions
  cardLayouts.forEach((layout, idx) => {
    const col = idx % columns;
    const row = Math.floor(idx / columns);

    if (col >= colStarts.length || row >= rowStarts.length) return;

    const cellLeft = colStarts[col];
    const cellTop = rowStarts[row];
    const cellWidth = colWidths[col];
    const cellHeight = rowHeights[row];

    // Card is centered within cell
    const cardLeft = cellLeft + (cellWidth - layout.cardWidthMm) / 2;
    const cardTop = cellTop + (cellHeight - layout.cardHeightMm) / 2;

    // Cut positions are at bleed edge (inset from card edge by bleedMm)
    const leftCut = cardLeft + layout.bleedMm;
    const rightCut = cardLeft + layout.bleedMm + baseCardWidthMm;
    const topCut = cardTop + layout.bleedMm;
    const bottomCut = cardTop + layout.bleedMm + baseCardHeightMm;

    // Vertical cuts
    xCutsMap.set(leftCut, xCutsMap.get(leftCut) === 'right' ? 'both' : 'left');
    xCutsMap.set(rightCut, xCutsMap.get(rightCut) === 'left' ? 'both' : 'right');

    // Horizontal cuts
    yCutsMap.set(topCut, yCutsMap.get(topCut) === 'bottom' ? 'both' : 'top');
    yCutsMap.set(bottomCut, yCutsMap.get(bottomCut) === 'top' ? 'both' : 'bottom');
  });

  // Draw vertical cut lines
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
      drawLine(-guideWidthPx);
    }
    if (type === 'right' || type === 'both') {
      drawLine(0);
    }
  });

  // Draw horizontal cut lines
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
      drawLine(-guideWidthPx);
    }
    if (type === 'bottom' || type === 'both') {
      drawLine(0);
    }
  });

  return <>{els}</>;
});

export default EdgeCutLines;
