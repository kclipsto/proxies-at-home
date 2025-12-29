import type { CardOption } from "../../../shared/types";
import { extractMpcIdentifierFromImageId } from "./mpcAutofillApi";

/**
 * Builds an MPC Autofill-compatible XML from cards.
 * Only includes cards that have MPC identifiers.
 */
export function buildMpcXml(cards: CardOption[]): string {
    const mpcCards = cards
        .filter(c => !c.linkedFrontId) // Skip linked back cards
        .map(c => ({
            name: c.name,
            identifier: extractMpcIdentifierFromImageId(c.imageId),
        }))
        .filter(c => c.identifier); // Only include MPC cards

    if (mpcCards.length === 0) {
        return '';
    }

    // Build XML structure matching MPC Autofill format
    const xmlLines = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<order>',
        '  <details>',
        '    <bracket>612</bracket>',
        '    <quantity>0</quantity>',
        '    <stock>(S30) Standard Smooth</stock>',
        '    <foil>false</foil>',
        '  </details>',
        '  <fronts>',
    ];

    mpcCards.forEach((card, idx) => {
        xmlLines.push(`    <card>`);
        xmlLines.push(`      <id>${card.identifier}</id>`);
        xmlLines.push(`      <slots>${idx}</slots>`);
        xmlLines.push(`      <name>${escapeXml(card.name)}</name>`);
        xmlLines.push(`      <query>${escapeXml(card.name)}</query>`);
        xmlLines.push(`    </card>`);
    });

    xmlLines.push('  </fronts>');
    xmlLines.push('  <backs>');
    xmlLines.push('  </backs>');
    xmlLines.push('  <cardback></cardback>');
    xmlLines.push('</order>');

    return xmlLines.join('\n');
}

/**
 * Escapes special XML characters.
 */
function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Downloads the XML as a file.
 */
export function downloadMpcXml(cards: CardOption[], filename?: string) {
    const xml = buildMpcXml(cards);
    if (!xml) {
        console.warn('No MPC cards to export');
        return false;
    }

    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `mpc_decklist_${new Date().toISOString().slice(0, 10)}.xml`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
}
