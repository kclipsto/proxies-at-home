/**
 * Database Types
 * 
 * Stricter types for database settings and values.
 */

/**
 * Allowed setting value types - stricter than generic Json type.
 */
export type SettingValue =
    | string
    | number
    | boolean
    | string[]
    | number[]
    | Record<string, boolean>
    | Record<string, string>;

/**
 * Interface for typed settings entries.
 */
export interface TypedSetting<K extends string, V extends SettingValue> {
    id: K;
    value: V;
}

/**
 * Known setting keys and their types.
 */
export type KnownSettings = {
    sortBy: string;
    sortOrder: 'asc' | 'desc';
    preferredArtSource: 'scryfall' | 'mpc';
    globalLanguage: string;
    autoImportTokens: boolean;
    filterManaCost: number[];
    filterColors: string[];
    filterTypes: string[];
    filterCategories: string[];
    filterMatchType: 'any' | 'all';
    favoriteMpcSources: string[];
    favoriteMpcTags: string[];
    minMpcDpi: number;
};
