import { createContext, useContext, useState } from "react";

type PageSettings = {
  pageWidthIn: number;
  setPageWidthIn: (value: number) => void;
  pageHeightIn: number;
  setPageHeightIn: (value: number) => void;
  columns: number;
  setColumns: (value: number) => void;
  rows: number;
  setRows: (value: number) => void;
  bleedEdgeWidth: number;
  setBleedEdgeWidth: (value: number) => void;
  bleedEdge: boolean;
  setBleedEdge: (value: boolean) => void;
  guideColor: string;
  setGuideColor: (value: string) => void;
  guideWidth: number;
  setGuideWidth: (value: number) => void;
  zoom: number;
  setZoom: (value: number) => void;
};

const initialPageSettings: PageSettings = {
  pageWidthIn: 8.5,
  setPageWidthIn: () => {},
  pageHeightIn: 11,
  setPageHeightIn: () => {},
  columns: 2,
  setColumns: () => {},
  rows: 2,
  setRows: () => {},
  bleedEdgeWidth: 0,
  setBleedEdgeWidth: () => {},
  bleedEdge: false,
  setBleedEdge: () => {},
  guideColor: "#000000",
  setGuideColor: () => {},
  guideWidth: 1,
  setGuideWidth: () => {},
  zoom: 1,
  setZoom: () => {},
};

const PageSettingsContext = createContext<PageSettings>(initialPageSettings);

export function PageSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [pageWidthIn, setPageWidthIn] = useState(8.5);
  const [pageHeightIn, setPageHeightIn] = useState(11);
  const [columns, setColumns] = useState(3);
  const [rows, setRows] = useState(3);
  const [bleedEdgeWidth, setBleedEdgeWidth] = useState(1);
  const [bleedEdge, setBleedEdge] = useState(true);
  const [guideColor, setGuideColor] = useState("#39FF14");
  const [guideWidth, setGuideWidth] = useState(0.5);
  const [zoom, setZoom] = useState(1.0);

  return (
    <PageSettingsContext.Provider
      value={{
        pageWidthIn,
        setPageWidthIn,
        pageHeightIn,
        setPageHeightIn,
        columns,
        setColumns,
        rows,
        setRows,
        bleedEdgeWidth,
        setBleedEdgeWidth,
        bleedEdge,
        setBleedEdge,
        guideColor,
        setGuideColor,
        guideWidth,
        setGuideWidth,
        zoom,
        setZoom,
      }}
    >
      {children}
    </PageSettingsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const usePageSettings = () => {
  const context = useContext(PageSettingsContext);
  if (!context) {
    throw new Error(
      "usePageSettings must be used within a PageSettingsProvider"
    );
  }
  return context;
};
