import type { Transport } from '../domain/types';
import { normalizeTransport } from './localRepository';

/**
 * Overdracht van een transport aan een collega (bijv. per e-mail), zodat die het op een ander apparaat verder kan invullen.
 * Het volledige transport (met alle stabiele identifiers) gaat als JSON, zo mogelijk gecomprimeerd (gzip), in base64 tussen
 * twee markeringsregels. Bij importeren mag de hele e-mail worden geplakt; alles buiten het blok wordt genegeerd.
 */
export const HANDOVER_BEGIN = '-----BEGIN NEO.CAB OVERDRACHT-----';
export const HANDOVER_END = '-----EINDE NEO.CAB OVERDRACHT-----';
const FORMAT = 'neocab-transport';
const VERSION = 1;
const LINE = 76;

interface Envelope {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  transport: Transport;
}

export class HandoverError extends Error {}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const canCompress = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** Overdrachtscode van een transport (inclusief begin- en eindregel). */
export async function encodeHandover(t: Transport, now = new Date()): Promise<string> {
  const envelope: Envelope = { format: FORMAT, version: VERSION, exportedAt: now.toISOString(), transport: t };
  const json = new TextEncoder().encode(JSON.stringify(envelope));
  const gz = canCompress();
  const data = bytesToBase64(gz ? await pipe(json, new CompressionStream('gzip')) : json);
  const lines = data.match(new RegExp(`.{1,${LINE}}`, 'g')) ?? [];
  return [HANDOVER_BEGIN, `v${VERSION}.${gz ? 'gz' : 'json'}`, ...lines, HANDOVER_END].join('\n');
}

/** Leest een transport uit een overdrachtscode of uit een hele e-mail waarin die code staat. */
export async function decodeHandover(text: string): Promise<{ transport: Transport; exportedAt: string }> {
  const start = text.indexOf(HANDOVER_BEGIN);
  const end = text.indexOf(HANDOVER_END, start + 1);
  if (start < 0 || end < 0) throw new HandoverError('Geen overdrachtscode gevonden. Plak de hele e-mail of het blok vanaf “BEGIN NEO.CAB OVERDRACHT” tot en met “EINDE”.');
  // Regels kunnen in een doorgestuurde e-mail met "> " zijn geciteerd of anders zijn afgebroken.
  const lines = text
    .slice(start + HANDOVER_BEGIN.length, end)
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s>]+/, '').trim())
    .filter(Boolean);
  const header = lines.shift() ?? '';
  const m = /^v(\d+)\.(gz|json)$/.exec(header);
  if (!m) throw new HandoverError('De overdrachtscode is onvolledig of beschadigd.');
  if (Number(m[1]) > VERSION) throw new HandoverError('Deze overdrachtscode komt uit een nieuwere versie van Neo.Cab.');
  let envelope: Envelope;
  try {
    let bytes = base64ToBytes(lines.join('').replace(/\s+/g, ''));
    if (m[2] === 'gz') {
      if (!canCompress()) throw new HandoverError('Deze browser kan de overdrachtscode niet uitpakken. Gebruik een recente browser.');
      bytes = await pipe(bytes, new DecompressionStream('gzip'));
    }
    envelope = JSON.parse(new TextDecoder().decode(bytes)) as Envelope;
  } catch (e) {
    if (e instanceof HandoverError) throw e;
    throw new HandoverError('De overdrachtscode is onvolledig of beschadigd. Controleer of het hele blok is gekopieerd.');
  }
  const transport = envelope?.format === FORMAT ? normalizeTransport(envelope.transport) : null;
  if (!transport) throw new HandoverError('De overdrachtscode bevat geen geldig transport.');
  return { transport, exportedAt: typeof envelope.exportedAt === 'string' ? envelope.exportedAt : '' };
}

/** Onderwerp en tekst van de overdrachtsmail. */
export function handoverEmail(t: Transport, code: string): { subject: string; body: string } {
  const who = [t.child.name || (t.child.patientNumber ? '' : 'anoniem transport'), t.child.patientNumber ? `patiëntnummer ${t.child.patientNumber}` : ''].filter(Boolean).join(', ');
  return {
    subject: `Neo.Cab overdracht – ${who}`,
    body: [
      `Overdracht van een transportregistratie in Neo.Cab (${who}).`,
      '',
      'Verder invullen: open Neo.Cab, kies op de startpagina “Transport importeren” en plak deze hele e-mail (of alleen het blok hieronder). Het transport verschijnt daarna bij de opgeslagen concepten.',
      '',
      'Let op: dit bericht bevat patiëntgegevens.',
      '',
      code,
      '',
    ].join('\n'),
  };
}

export function handoverFileName(t: Transport): string {
  const safe = (s: string) => s.normalize('NFKD').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '');
  return ['neocab-overdracht', safe(t.child.name), safe(t.child.patientNumber)].filter(Boolean).join('-') + '.txt';
}
