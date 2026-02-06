import { Modal, ModalHeader, ModalBody, ModalFooter, Label, Button, TextInput, Checkbox } from "flowbite-react";
import { useState, useCallback, useMemo } from "react";
import { useSettingsStore } from "@/store/settings";
import { baseCardWidthMm, baseCardHeightMm } from "@/helpers/layout";
import { settingsToCuttingTemplate, downloadCuttingTemplatePDF } from "@/helpers/exportCuttingTemplate";

interface PerCardOffsetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PerCardOffsetModal({ isOpen, onClose }: PerCardOffsetModalProps) {
  const columns = useSettingsStore((state) => state.columns);
  const rows = useSettingsStore((state) => state.rows);
  const bleedEdge = useSettingsStore((state) => state.bleedEdge);
  const bleedEdgeWidth = useSettingsStore((state) => state.bleedEdgeWidth);
  const bleedEdgeUnit = useSettingsStore((state) => state.bleedEdgeUnit);
  const perCardBackOffsets = useSettingsStore((state) => state.perCardBackOffsets);
  const setPerCardBackOffset = useSettingsStore((state) => state.setPerCardBackOffset);
  const clearPerCardBackOffsets = useSettingsStore((state) => state.clearPerCardBackOffsets);

  // Get all settings needed for cutting template export
  const pageWidth = useSettingsStore((state) => state.pageWidth);
  const pageHeight = useSettingsStore((state) => state.pageHeight);
  const pageUnit = useSettingsStore((state) => state.pageSizeUnit);
  const pageOrientation = useSettingsStore((state) => state.pageOrientation);
  const cardSpacingMm = useSettingsStore((state) => state.cardSpacingMm);
  const cardPositionX = useSettingsStore((state) => state.cardPositionX);
  const cardPositionY = useSettingsStore((state) => state.cardPositionY);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [includeCutGuides, setIncludeCutGuides] = useState(true);

  // Convert bleed to mm
  const bleedMm = bleedEdge
    ? (bleedEdgeUnit === 'in' ? bleedEdgeWidth * 25.4 : bleedEdgeWidth)
    : 0;

  // Card slot size (content + bleed)
  const slotWidthMm = baseCardWidthMm + 2 * bleedMm;
  const slotHeightMm = baseCardHeightMm + 2 * bleedMm;

  // Grid positions
  const gridPositions = useMemo(() => {
    const positions: Array<{ index: number; row: number; col: number }> = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        positions.push({ index: row * columns + col, row, col });
      }
    }
    return positions;
  }, [rows, columns]);

  const selectedOffset = selectedIndex !== null ? perCardBackOffsets[selectedIndex] : null;

  const handleOffsetChange = useCallback((field: 'x' | 'y' | 'rotation', value: number) => {
    if (selectedIndex === null) return;

    const current = perCardBackOffsets[selectedIndex] || { x: 0, y: 0, rotation: 0 };
    setPerCardBackOffset(selectedIndex, {
      ...current,
      [field]: value,
    });
  }, [selectedIndex, perCardBackOffsets, setPerCardBackOffset]);

  const handleResetCurrent = useCallback(() => {
    if (selectedIndex === null) return;
    setPerCardBackOffset(selectedIndex, { x: 0, y: 0, rotation: 0 });
  }, [selectedIndex, setPerCardBackOffset]);

  const handleResetAll = useCallback(() => {
    clearPerCardBackOffsets();
    setSelectedIndex(null);
  }, [clearPerCardBackOffsets]);

  const handleExportTemplate = useCallback(async () => {
    const settings = settingsToCuttingTemplate(
      pageWidth,
      pageHeight,
      pageUnit,
      columns,
      rows,
      bleedEdge,
      bleedEdgeWidth,
      bleedEdgeUnit,
      cardSpacingMm,
      cardPositionX,
      cardPositionY,
      pageOrientation === 'portrait'
    );

    // Add per-card offsets to settings
    settings.perCardOffsets = perCardBackOffsets;
    settings.includeCutGuides = includeCutGuides;

    await downloadCuttingTemplatePDF(settings);
  }, [
    pageWidth, pageHeight, pageUnit, pageOrientation, columns, rows,
    bleedEdge, bleedEdgeWidth, bleedEdgeUnit,
    cardSpacingMm, cardPositionX, cardPositionY,
    perCardBackOffsets, includeCutGuides
  ]);

  // Scale for display - make cards visible and clickable (roughly 180px wide for standard card)
  const displayScale = 2.7;
  const displaySlotWidth = slotWidthMm * displayScale;
  const displaySlotHeight = slotHeightMm * displayScale;

  return (
    <Modal show={isOpen} onClose={onClose} size="7xl">
      <ModalHeader>Adjust Card Back Placement</ModalHeader>
      <ModalBody>
        <div className="flex gap-6 max-h-[calc(100vh-200px)]">
          {/* Grid visualization */}
          <div className="flex-1 flex justify-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg overflow-auto">
            <div className="relative">
              {/* Grid */}
              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: `repeat(${columns}, ${displaySlotWidth}px)`,
                  gridTemplateRows: `repeat(${rows}, ${displaySlotHeight}px)`,
                }}
              >
                {gridPositions.map(({ index, row, col }) => {
                  const offset = perCardBackOffsets[index];
                  const hasOffset = offset && (offset.x !== 0 || offset.y !== 0 || offset.rotation !== 0);
                  const isSelected = selectedIndex === index;

                  return (
                    <button
                      key={index}
                      onClick={() => setSelectedIndex(index)}
                      className={`
                        relative border-2 rounded-lg transition-all flex items-center justify-center
                        ${isSelected
                          ? 'border-blue-500 bg-blue-100 dark:bg-blue-900 shadow-xl scale-105 ring-2 ring-blue-300'
                          : hasOffset
                          ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900 hover:border-yellow-500 hover:shadow-lg'
                          : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:border-gray-400 hover:shadow-md'
                        }
                      `}
                      style={{
                        width: `${displaySlotWidth}px`,
                        height: `${displaySlotHeight}px`,
                      }}
                      title={`Card ${index + 1} (Row ${row + 1}, Col ${col + 1})`}
                    >
                      {/* Position label */}
                      <div className="flex flex-col items-center gap-1">
                        <span className={`text-2xl font-semibold ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-600 dark:text-gray-400'}`}>
                          {index + 1}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          R{row + 1} C{col + 1}
                        </span>
                      </div>
                      {/* Offset indicator */}
                      {hasOffset && (
                        <div className="absolute top-2 right-2 flex gap-1">
                          <div className="w-3 h-3 bg-yellow-500 rounded-full" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="mt-6 text-center">
                <p className="text-base font-medium text-gray-700 dark:text-gray-300">
                  {rows} × {columns} grid
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Click a card to adjust its position
                </p>
              </div>
            </div>
          </div>

          {/* Controls panel */}
          <div className="w-96 space-y-4 flex-shrink-0">
            {selectedIndex !== null ? (
              <>
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
                  <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                    Card {selectedIndex + 1}
                  </h3>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Row {Math.floor(selectedIndex / columns) + 1}, Col {(selectedIndex % columns) + 1}
                  </p>
                </div>

                <div>
                  <Label htmlFor="offset-x">X Offset (mm)</Label>
                  <div className="flex gap-2 items-center mt-1">
                    <Button
                      size="xs"
                      color="gray"
                      onClick={() => handleOffsetChange('x', (selectedOffset?.x || 0) - 0.1)}
                    >
                      −
                    </Button>
                    <TextInput
                      id="offset-x"
                      type="number"
                      step="0.1"
                      value={selectedOffset?.x || 0}
                      onChange={(e) => handleOffsetChange('x', parseFloat(e.target.value) || 0)}
                      className="flex-1"
                    />
                    <Button
                      size="xs"
                      color="gray"
                      onClick={() => handleOffsetChange('x', (selectedOffset?.x || 0) + 0.1)}
                    >
                      +
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Positive = right, Negative = left
                  </p>
                </div>

                <div>
                  <Label htmlFor="offset-y">Y Offset (mm)</Label>
                  <div className="flex gap-2 items-center mt-1">
                    <Button
                      size="xs"
                      color="gray"
                      onClick={() => handleOffsetChange('y', (selectedOffset?.y || 0) - 0.1)}
                    >
                      −
                    </Button>
                    <TextInput
                      id="offset-y"
                      type="number"
                      step="0.1"
                      value={selectedOffset?.y || 0}
                      onChange={(e) => handleOffsetChange('y', parseFloat(e.target.value) || 0)}
                      className="flex-1"
                    />
                    <Button
                      size="xs"
                      color="gray"
                      onClick={() => handleOffsetChange('y', (selectedOffset?.y || 0) + 0.1)}
                    >
                      +
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Positive = down, Negative = up
                  </p>
                </div>

                <div>
                  <Label htmlFor="offset-rotation">Rotation (degrees)</Label>
                  <div className="flex gap-2 items-center mt-1">
                    <Button
                      size="xs"
                      color="gray"
                      onClick={() => handleOffsetChange('rotation', (selectedOffset?.rotation || 0) - 0.1)}
                    >
                      −
                    </Button>
                    <TextInput
                      id="offset-rotation"
                      type="number"
                      step="0.1"
                      value={selectedOffset?.rotation || 0}
                      onChange={(e) => handleOffsetChange('rotation', parseFloat(e.target.value) || 0)}
                      className="flex-1"
                    />
                    <Button
                      size="xs"
                      color="gray"
                      onClick={() => handleOffsetChange('rotation', (selectedOffset?.rotation || 0) + 0.1)}
                    >
                      +
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Positive = clockwise (0.1° increments)
                  </p>
                </div>

                <Button
                  color="light"
                  onClick={handleResetCurrent}
                  className="w-full"
                >
                  Reset This Card
                </Button>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
                <div className="text-center">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                  </svg>
                  <p className="text-sm">
                    Click on a card to adjust its position
                  </p>
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button
                color="failure"
                onClick={handleResetAll}
                className="w-full"
              >
                Reset All Offsets
              </Button>
            </div>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <div className="flex justify-between items-center w-full">
          <div className="flex items-center gap-4">
            <Button color="gray" onClick={handleExportTemplate}>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Export Test Template (PDF)
            </Button>
            <div className="flex items-center gap-2">
              <Checkbox
                id="includeCutGuides"
                checked={includeCutGuides}
                onChange={(e) => setIncludeCutGuides(e.target.checked)}
              />
              <Label htmlFor="includeCutGuides" className="cursor-pointer select-none text-sm">
                Include cut guides
              </Label>
            </div>
          </div>
          <Button onClick={onClose}>Done</Button>
        </div>
      </ModalFooter>
    </Modal>
  );
}
