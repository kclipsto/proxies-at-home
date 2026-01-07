import type { CardOption } from "../../../shared/types";
import { extractMpcIdentifierFromImageId } from "./mpcAutofillApi";
import { inferImageSource } from "./imageSourceUtils";

/**
 * Builds an MPC Autofill-compatible XML from cards.
 * Only includes cards that have MPC identifiers.
 */
export function buildMpcXml(cards: CardOption[], defaultCardbackId?: string): string {
    const cardMap = new Map(cards.map(c => [c.uuid, c]));

    const frontCards = cards.filter(c => !c.linkedFrontId);

    const mpcFronts = frontCards
        .map((c, index) => {
            // Only extract MPC ID if the source is actually 'mpc' (prevents false positives)
            const source = inferImageSource(c.imageId);
            const identifier = source === 'mpc' ? extractMpcIdentifierFromImageId(c.imageId) : null;
            return { card: c, index, identifier };
        })
        .filter(item => item.identifier);

    if (mpcFronts.length === 0) {
        return '';
    }

    const xmlLines = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<order>',
        '  <details>',
        '    <bracket>612</bracket>',
        `<quantity>${mpcFronts.length}</quantity>`,
        '    <stock>(S30) Standard Smooth</stock>',
        '    <foil>false</foil>',
        '  </details>',
        '  <fronts>',
    ];

    mpcFronts.forEach(({ card, index, identifier }) => {
        xmlLines.push(`    <card>`);
        xmlLines.push(`      <id>${identifier}</id>`);
        xmlLines.push(`      <slots>${index}</slots>`);
        xmlLines.push(`      <name>${escapeXml(card.name.split(' // ')[0])}</name>`);
        xmlLines.push(`      <query>${escapeXml(card.name.split(' // ')[0])}</query>`);
        xmlLines.push(`    </card>`);
    });

    xmlLines.push('  </fronts>');
    xmlLines.push('  <backs>');

    mpcFronts.forEach(({ card, index }) => {
        let backIdentifier: string | null = null;
        let backName = `${card.name} (Back)`;

        if (card.linkedBackId) {
            const backCard = cardMap.get(card.linkedBackId);
            if (backCard) {
                // Only extract MPC ID if the source is actually 'mpc'
                const backSource = inferImageSource(backCard.imageId);
                backIdentifier = backSource === 'mpc' ? extractMpcIdentifierFromImageId(backCard.imageId) : null;

                if (backCard.name.includes(' // ')) {
                    backName = backCard.name.split(' // ')[1];
                } else {
                    backName = backCard.name;
                }
            }
        }

        if (backIdentifier) {
            xmlLines.push(`    <card>`);
            xmlLines.push(`      <id>${backIdentifier}</id>`);
            xmlLines.push(`      <slots>${index}</slots>`);
            xmlLines.push(`      <name>${escapeXml(backName)}</name>`);
            xmlLines.push(`      <query>${escapeXml(backName)}</query>`);
            xmlLines.push(`    </card>`);
        }
    });

    xmlLines.push('  </backs>');
    xmlLines.push(`  <cardback>${defaultCardbackId || ''}</cardback>`);
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
export function downloadMpcXml(cards: CardOption[], filename?: string, defaultCardbackId?: string) {
    const xml = buildMpcXml(cards, defaultCardbackId);
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
