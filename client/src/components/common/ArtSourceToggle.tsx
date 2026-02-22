import { ToggleButtonGroup, type ToggleButtonGroupProps } from './ToggleButtonGroup';

export type ArtSource = 'scryfall' | 'mpc' | 'upload-library';

const ART_SOURCE_OPTIONS_BASE = [
    { id: 'scryfall' as const, label: 'Scryfall', highlightColor: '#431e3f' },
    { id: 'mpc' as const, label: 'MPC Autofill', highlightColor: 'rgb(76, 155, 232)' },
];

const UPLOAD_LIBRARY_OPTION = { id: 'upload-library' as const, label: 'My Uploads', highlightColor: '#2d7a4f' };

type ArtSourceToggleProps = {
    value: ArtSource;
    onChange: (value: ArtSource) => void;
    reversed?: boolean;
    showUploadLibrary?: boolean;
} & Omit<ToggleButtonGroupProps<ArtSource>, 'options' | 'value' | 'onChange'>;

export function ArtSourceToggle({
    value,
    onChange,
    reversed = false,
    showUploadLibrary = false,
    ...rest
}: ArtSourceToggleProps) {
    const base = showUploadLibrary
        ? [...ART_SOURCE_OPTIONS_BASE, UPLOAD_LIBRARY_OPTION]
        : ART_SOURCE_OPTIONS_BASE;
    const options = reversed ? [...base].reverse() : base;
    return (
        <ToggleButtonGroup
            options={options}
            value={value}
            onChange={onChange}
            {...rest}
        />
    );
}
