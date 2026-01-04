/**
 * Centralized asset exports with correct base URL handling for Electron
 */

const BASE = import.meta.env.BASE_URL;

// Public folder assets (resolved at runtime with correct base path)
export const logoSvg = `${BASE}logo.svg`;
export const logoRound = `${BASE}logo-round.svg`;
