import React from "react";
import { useSettingsStore } from "../store";

type Props = {
  totalCardWidthMm: number;
  totalCardHeightMm: number;
  baseCardWidthMm: number;
  baseCardHeightMm: number;
  bleedEdgeWidthMm: number;
};

const EdgeCutLines = ({
  totalCardWidthMm,
  totalCardHeightMm,
  baseCardWidthMm,
  baseCardHeightMm,
  bleedEdgeWidthMm,
}: Props) => {
  const bleedEdge = useSettingsStore((state) => state.bleedEdge);
  const guideWidth = useSettingsStore((state) => state.guideWidth);
  const pageSizeUnit = useSettingsStore((state) => state.pageSizeUnit);
  const pageWidth = useSettingsStore((state) => state.pageWidth);
  const pageHeight = useSettingsStore((state) => state.pageHeight);
  const columns = useSettingsStore((state) => state.columns);
  const rows = useSettingsStore((state) => state.rows);

  if (!bleedEdge) return null;

  const pageWidthMm = pageSizeUnit === "mm" ? pageWidth : pageWidth * 25.4;
  const pageHeightMm = pageSizeUnit === "mm" ? pageHeight : pageHeight * 25.4;

  const gridWidthMm = columns * totalCardWidthMm;
  const gridHeightMm = rows * totalCardHeightMm;

  const startXmm = (pageWidthMm - gridWidthMm) / 2;
  const startYmm = (pageHeightMm - gridHeightMm) / 2;

  const cutInX = bleedEdgeWidthMm;
  const cutOutX = bleedEdgeWidthMm + baseCardWidthMm;
  const cutInY = bleedEdgeWidthMm;
  const cutOutY = bleedEdgeWidthMm + baseCardHeightMm;

  // Collect all vertical/horizontal cut positions
  const xCuts = new Set<number>();
  for (let c = 0; c < columns; c++) {
    const cellLeft = startXmm + c * totalCardWidthMm;
    xCuts.add(cellLeft + cutInX);
    xCuts.add(cellLeft + cutOutX);
  }
  const yCuts = new Set<number>();
  for (let r = 0; r < rows; r++) {
    const cellTop = startYmm + r * totalCardHeightMm;
    yCuts.add(cellTop + cutInY);
    yCuts.add(cellTop + cutOutY);
  }

  const els: React.ReactElement[] = [];

  // For each vertical cut, draw two stubs:
  // top: page top -> top corner tick
  // bottom: page bottom -> bottom corner tick
  const stubH = startYmm + cutInY;
  [...xCuts].forEach((x, i) => {
    els.push(
      <div
        key={`v-top-${i}`}
        style={{
          position: "absolute",
          left: `${x}mm`,
          top: 0,
          width: `${guideWidth}px`,
          height: `${stubH}mm`,
          backgroundColor: "black",
          pointerEvents: "none",
        }}
      />,
      <div
        key={`v-bot-${i}`}
        style={{
          position: "absolute",
          left: `${x}mm`,
          top: `${pageHeightMm - stubH}mm`,
          width: `${guideWidth}px`,
          height: `${stubH}mm`,
          backgroundColor: "black",
          pointerEvents: "none",
        }}
      />
    );
  });

  // Same as above for horizontal cuts
  const stubW = startXmm + cutInX;
  [...yCuts].forEach((y, i) => {
    els.push(
      <div
        key={`h-left-${i}`}
        style={{
          position: "absolute",
          top: `${y}mm`,
          left: 0,
          height: `${guideWidth}px`,
          width: `${stubW}mm`,
          backgroundColor: "black",
          pointerEvents: "none",
        }}
      />,
      <div
        key={`h-right-${i}`}
        style={{
          position: "absolute",
          top: `${y}mm`,
          left: `${pageWidthMm - stubW}mm`,
          height: `${guideWidth}px`,
          width: `${stubW}mm`,
          backgroundColor: "black",
          pointerEvents: "none",
        }}
      />
    );
  });

  return <>{els}</>;
};

export default EdgeCutLines;
