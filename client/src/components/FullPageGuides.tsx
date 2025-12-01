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

  if (cutLineStyle === "none") return null;

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

  const els: React.ReactElement[] = [];

  // Vertical cuts
  [...xCuts].forEach((x, i) => {
    if (cutLineStyle === "full") {
      els.push(
        <div
          key={`v-${i}`}
          style={{
            position: "absolute",
            left: `${x}mm`,
            top: 0,
            width: `${guideWidth}px`,
            height: `${pageHeightMm}mm`,
            backgroundColor: "black",
            pointerEvents: "none",
          }}
        />
      );
    } else {
      // Edges only
      // Top stub
      if (startYmm > 0) {
        els.push(
          <div
            key={`v-top-${i}`}
            style={{
              position: "absolute",
              left: `${x}mm`,
              top: 0,
              width: `${guideWidth}px`,
              height: `${startYmm}mm`,
              backgroundColor: "black",
              pointerEvents: "none",
            }}
          />
        );
      }
      // Bottom stub
      const botStubStart = startYmm + gridHeightMm;
      const botStubH = pageHeightMm - botStubStart;
      if (botStubH > 0) {
        els.push(
          <div
            key={`v-bot-${i}`}
            style={{
              position: "absolute",
              left: `${x}mm`,
              top: `${botStubStart}mm`,
              width: `${guideWidth}px`,
              height: `${botStubH}mm`,
              backgroundColor: "black",
              pointerEvents: "none",
            }}
          />
        );
      }
    }
  });

  // Horizontal cuts
  [...yCuts].forEach((y, i) => {
    if (cutLineStyle === "full") {
      els.push(
        <div
          key={`h-${i}`}
          style={{
            position: "absolute",
            top: `${y}mm`,
            left: 0,
            height: `${guideWidth}px`,
            width: `${pageWidthMm}mm`,
            backgroundColor: "black",
            pointerEvents: "none",
          }}
        />
      );
    } else {
      // Edges only
      // Left stub
      if (startXmm > 0) {
        els.push(
          <div
            key={`h-left-${i}`}
            style={{
              position: "absolute",
              top: `${y}mm`,
              left: 0,
              height: `${guideWidth}px`,
              width: `${startXmm}mm`,
              backgroundColor: "black",
              pointerEvents: "none",
            }}
          />
        );
      }
      // Right stub
      const rightStubStart = startXmm + gridWidthMm;
      const rightStubW = pageWidthMm - rightStubStart;
      if (rightStubW > 0) {
        els.push(
          <div
            key={`h-right-${i}`}
            style={{
              position: "absolute",
              top: `${y}mm`,
              left: `${rightStubStart}mm`,
              height: `${guideWidth}px`,
              width: `${rightStubW}mm`,
              backgroundColor: "black",
              pointerEvents: "none",
            }}
          />
        );
      }
    }
  });

  return <>{els}</>;
});

export default EdgeCutLines;
