import { useSettingsStore } from "@/store/settings";
import { Label } from "flowbite-react";
import { PageSizeControl } from "../../LayoutSettings/PageSizeControl";
import { NumberInput } from "@/components/common";
import { useNormalizedInput } from "@/hooks/useInputHooks";

export function LayoutSection() {
    const columns = useSettingsStore((state) => state.columns);
    const rows = useSettingsStore((state) => state.rows);
    const setColumns = useSettingsStore((state) => state.setColumns);
    const setRows = useSettingsStore((state) => state.setRows);

    const columnsInput = useNormalizedInput(
        columns,
        (value) => setColumns(value),
        { min: 1, max: 10, isInteger: true }
    );

    const rowsInput = useNormalizedInput(
        rows,
        (value) => setRows(value),
        { min: 1, max: 10, isInteger: true }
    );

    return (
        <div className="space-y-4">
            <PageSizeControl />

            <div className="grid grid-cols-2 gap-3">
                <div>
                    <Label htmlFor="columns-input">Columns</Label>
                    <NumberInput
                        id="columns-input"
                        ref={columnsInput.inputRef}
                        className="w-full"
                        min={1}
                        max={10}
                        defaultValue={columnsInput.defaultValue}
                        onChange={columnsInput.handleChange}
                        onBlur={columnsInput.handleBlur}
                        placeholder={columns.toString()}
                    />
                </div>
                <div>
                    <Label htmlFor="rows-input">Rows</Label>
                    <NumberInput
                        id="rows-input"
                        ref={rowsInput.inputRef}
                        className="w-full"
                        min={1}
                        max={10}
                        defaultValue={rowsInput.defaultValue}
                        onChange={rowsInput.handleChange}
                        onBlur={rowsInput.handleBlur}
                        placeholder={rows.toString()}
                    />
                </div>
            </div>
        </div>
    );
}
