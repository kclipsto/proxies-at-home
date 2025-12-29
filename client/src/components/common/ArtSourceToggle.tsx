import { ToggleButtonGroup, type ToggleButtonGroupProps } from './ToggleButtonGroup';

type ArtSource = 'scryfall' | 'mpc';

const ART_SOURCE_OPTIONS = [
    { id: 'scryfall' as const, label: 'Scryfall', highlightColor: '#431e3f' },
    { id: 'mpc' as const, label: 'MPC Autofill', highlightColor: 'rgb(76, 155, 232)' },
];

// Same options but reversed order (for vertical/landscape mode where sideways-lr reads bottom-to-top)
const ART_SOURCE_OPTIONS_REVERSED = [
    { id: 'mpc' as const, label: 'MPC Autofill', highlightColor: 'rgb(76, 155, 232)' },
    { id: 'scryfall' as const, label: 'Scryfall', highlightColor: '#431e3f' },
];

type ArtSourceToggleProps = {
    value: ArtSource;
    onChange: (value: ArtSource) => void;
    /** When true, reverses option order (useful for vertical mode where sideways-lr reads bottom-to-top) */
    reversed?: boolean;
} & Omit<ToggleButtonGroupProps<ArtSource>, 'options' | 'value' | 'onChange'>;

/**
 * A styled toggle button for switching between Scryfall and MPC Autofill art sources.
 * Wraps ToggleButtonGroup with consistent branding colors.
 * 
 * Scryfall: #431e3f (dark purple)
 * MPC Autofill: rgb(76, 155, 232) (blue)
 * 
 * Use `reversed` prop for vertical landscape layouts where sideways-lr reads bottom-to-top.
 */
export function ArtSourceToggle({
    value,
    onChange,
    reversed = false,
    ...rest
}: ArtSourceToggleProps) {
    return (
        <ToggleButtonGroup
            options={reversed ? ART_SOURCE_OPTIONS_REVERSED : ART_SOURCE_OPTIONS}
            value={value}
            onChange={onChange}
            {...rest}
        />
    );
}
