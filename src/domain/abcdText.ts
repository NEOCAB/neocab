import { ABCD_KEYS, type AbcdKey, type AbcdNotes } from './types';
import { ABCD_LABELS } from './labels';

/**
 * ABCD als één tekstvak met de letters al ingevuld ("A Airway: …"). Per letter blijft de tekst apart bewaard (`AbcdNotes`),
 * zodat verslag, brief en export ongewijzigd blijven. Een regel die begint met de naam van een letter (met of zonder beginletter)
 * en een dubbele punt start die letter; andere regels horen bij de letter erboven.
 */
const NAMES = ABCD_KEYS.map((k) => ABCD_LABELS[k].replace(/[-]/g, '\\-'));
const MARKER = new RegExp(`^\\s*(?:[A-I]\\s+)?(${NAMES.join('|')})\\s*:\\s?(.*)$`, 'i');
const KEY_BY_NAME = new Map<string, AbcdKey>(ABCD_KEYS.map((k) => [ABCD_LABELS[k].toLowerCase(), k]));

export function abcdToText(notes: AbcdNotes): string {
  return ABCD_KEYS.map((k) => `${ABCD_LABELS[k][0]} ${ABCD_LABELS[k]}: ${notes[k] ?? ''}`).join('\n');
}

export function textToAbcd(text: string): AbcdNotes {
  const out = Object.fromEntries(ABCD_KEYS.map((k) => [k, ''])) as AbcdNotes;
  let cur: AbcdKey = ABCD_KEYS[0];
  for (const line of text.split('\n')) {
    const m = MARKER.exec(line);
    if (m) {
      cur = KEY_BY_NAME.get(m[1].toLowerCase()) ?? cur;
      out[cur] = out[cur] ? `${out[cur]}\n${m[2]}` : m[2];
    } else out[cur] = out[cur] ? `${out[cur]}\n${line}` : line;
  }
  return out;
}
