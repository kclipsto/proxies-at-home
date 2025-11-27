import { useSettingsStore } from "@/store/settings";
import { useLayoutEffect, useRef } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SettingsPanel } from "./SettingsPanel/SettingsPanel";
import { LayoutSection } from "./SettingsPanel/sections/LayoutSection";
import { BleedSection } from "./SettingsPanel/sections/BleedSection";
import { GuidesSection } from "./SettingsPanel/sections/GuidesSection";
import { CardSection } from "./SettingsPanel/sections/CardSection";
import { FilterSortSection } from "./SettingsPanel/sections/FilterSortSection";
import { ApplicationSection } from "./SettingsPanel/sections/ApplicationSection";
import { useImageProcessing } from "@/hooks/useImageProcessing";
import {
  Droplet,
  Filter,
  Grid3X3,
  LayoutTemplate,
  ScanLine,
  Settings,
} from "lucide-react";
import { Tooltip } from "flowbite-react";

import type { CardOption } from "../../../shared/types";

type PageSettingsControlsProps = {
  reprocessSelectedImages: ReturnType<
    typeof useImageProcessing
  >["reprocessSelectedImages"];
  cancelProcessing: ReturnType<typeof useImageProcessing>["cancelProcessing"];
  cards: CardOption[]; // Passed from parent to avoid redundant DB query
};

export function PageSettingsControls({
  reprocessSelectedImages,
  cancelProcessing,
  cards,
}: PageSettingsControlsProps) {
  const settingsPanelState = useSettingsStore((state) => state.settingsPanelState);
  const setPanelOrder = useSettingsStore((state) => state.setPanelOrder);
  const togglePanelCollapse = useSettingsStore(
    (state) => state.togglePanelCollapse
  );
  const isCollapsed = useSettingsStore((state) => state.isSettingsPanelCollapsed);
  const toggleSettingsPanel = useSettingsStore((state) => state.toggleSettingsPanel);

  const scrollPosRef = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!isCollapsed && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollPosRef.current;
    }
  }, [isCollapsed]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = settingsPanelState.order.indexOf(active.id as string);
      const newIndex = settingsPanelState.order.indexOf(over.id as string);
      setPanelOrder(arrayMove(settingsPanelState.order, oldIndex, newIndex));
    }
  };

  const renderSection = (id: string) => {
    const isOpen = !settingsPanelState.collapsed[id];
    const onToggle = () => togglePanelCollapse(id);

    switch (id) {
      case "layout":
        return (
          <SettingsPanel
            key={id}
            id={id}
            title="Layout"
            isOpen={isOpen}
            onToggle={onToggle}
            icon={LayoutTemplate}
          >
            <LayoutSection />
          </SettingsPanel>
        );
      case "bleed":
        return (
          <SettingsPanel
            key={id}
            id={id}
            title="Bleed"
            isOpen={isOpen}
            onToggle={onToggle}
            icon={Droplet}
          >
            <BleedSection
              reprocessSelectedImages={reprocessSelectedImages}
              cancelProcessing={cancelProcessing}
              cards={cards}
            />
          </SettingsPanel>
        );
      case "guides":
        return (
          <SettingsPanel
            key={id}
            id={id}
            title="Guides"
            isOpen={isOpen}
            onToggle={onToggle}
            icon={ScanLine}
          >
            <GuidesSection />
          </SettingsPanel>
        );
      case "card":
        return (
          <SettingsPanel
            key={id}
            id={id}
            title="Card"
            isOpen={isOpen}
            onToggle={onToggle}
            icon={Grid3X3}
          >
            <CardSection />
          </SettingsPanel>
        );
      case "filterSort":
        return (
          <SettingsPanel
            key={id}
            id={id}
            title="Filter & Sort"
            isOpen={isOpen}
            onToggle={onToggle}
            icon={Filter}
          >
            <FilterSortSection />
          </SettingsPanel>
        );
      case "application":
        return (
          <SettingsPanel
            key={id}
            id={id}
            title="Application"
            isOpen={isOpen}
            onToggle={onToggle}
            icon={Settings}
          >
            <ApplicationSection cards={cards} />
          </SettingsPanel>
        );
      default:
        return null;
    }
  };

  if (isCollapsed) {
    return (
      <div
        className="h-full flex flex-col bg-gray-100 dark:bg-gray-700 items-center py-4 gap-4 overflow-x-hidden border-l border-gray-200 dark:border-gray-600"
        onDoubleClick={() => toggleSettingsPanel()}
      >
        {settingsPanelState.order.map((id) => {
          let Icon = Settings;
          let label = "";
          switch (id) {
            case "layout":
              Icon = LayoutTemplate;
              label = "Layout";
              break;
            case "bleed":
              Icon = Droplet;
              label = "Bleed";
              break;
            case "guides":
              Icon = ScanLine;
              label = "Guides";
              break;
            case "card":
              Icon = Grid3X3;
              label = "Card";
              break;
            case "filterSort":
              Icon = Filter;
              label = "Filter & Sort";
              break;
            case "application":
              Icon = Settings;
              label = "Application";
              break;
          }

          return (
            <Tooltip key={id} content={label} placement="left">
              <button
                onClick={() => {
                  toggleSettingsPanel();
                  if (settingsPanelState.collapsed[id]) {
                    togglePanelCollapse(id);
                  }
                  // Wait for expansion animation/render
                  setTimeout(() => {
                    const element = document.getElementById(`settings-panel-${id}`);
                    element?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 100);
                }}
                className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors"
              >
                <Icon className="size-6" />
              </button>
            </Tooltip>
          );
        })}
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      onScroll={(e) => {
        scrollPosRef.current = e.currentTarget.scrollTop;
      }}
      className="h-full flex flex-col bg-gray-100 dark:bg-gray-700 overflow-y-auto overflow-x-hidden border-l border-gray-200 dark:border-gray-600"
    >
      <h2 className="text-2xl font-semibold dark:text-white p-4 pb-2">
        Settings
      </h2>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={settingsPanelState.order}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col">
            {settingsPanelState.order.map((id) => renderSection(id))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
