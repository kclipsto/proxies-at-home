import {
  MpcFilterBar,
  type MpcFilterProps,
} from "./MpcFilterBar";
import {
  ScryfallFilterBar,
  type ScryfallFilterProps,
} from "./ScryfallFilterBar";
import { UploadLibraryFilterBar, type UploadLibraryFilterProps } from "./UploadLibraryFilterBar";
export type { MpcFilterProps, ScryfallFilterProps, UploadLibraryFilterProps };
export type CardArtFilterBarProps =
  | MpcFilterProps
  | ScryfallFilterProps
  | UploadLibraryFilterProps;

/**
 * Unified filter bar for MPC, Scryfall, and Upload Library.
 * Delegates to specific sub-components based on `mode`.
 */
export function CardArtFilterBar(props: CardArtFilterBarProps) {
  const { mode } = props;

  if (mode === "mpc") {
    return <MpcFilterBar {...(props as MpcFilterProps)} />;
  }

  if (mode === "scryfall") {
    return <ScryfallFilterBar {...(props as ScryfallFilterProps)} />;
  }

  if (mode === "upload-library") {
    return <UploadLibraryFilterBar {...(props as UploadLibraryFilterProps)} />;
  }

  return null;
}
