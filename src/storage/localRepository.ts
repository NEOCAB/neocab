import type { Measurement, Transport } from '../domain/types';
import { newTransport } from '../domain/factory';
import { summarize, type TransportRepository, type TransportSummary } from './repository';

const PREFIX = 'neonataal-transport:v1:';
const INDEX_KEY = `${PREFIX}index`;

/** Minimale Storage-interface (localStorage, of een stub in tests). */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Vult ontbrekende velden aan met lege standaardwaarden, zonder bestaande waarden (zoals tijdstippen) te wijzigen. */
function mergeDefaults<T>(defaults: T, stored: unknown): T {
  if (!isObject(defaults) || !isObject(stored)) return (stored === undefined ? defaults : stored) as T;
  const out: Record<string, unknown> = { ...stored };
  for (const [k, v] of Object.entries(defaults)) {
    if (!(k in stored)) out[k] = v;
    else if (isObject(v) && isObject(stored[k])) out[k] = mergeDefaults(v, stored[k]);
  }
  return out as T;
}

export function normalizeTransport(raw: unknown): Transport | null {
  if (!isObject(raw) || typeof raw.id !== 'string') return null;
  const defaults = newTransport();
  // Standaard-"nu" van een lege registratie mag een opgeslagen waarde nooit vervangen.
  const t = mergeDefaults({ ...defaults, id: raw.id }, raw);
  return migrateParentPhones({ ...t, measurements: t.measurements.map(migrateCpapToPeep) }, raw);
}

/** Oudere concepten hadden een lijst `parentPhones`; nu: eerste nummer = moeder, overige = partner. */
function migrateParentPhones(t: Transport, raw: Record<string, unknown>): Transport {
  const old = raw.parentPhones;
  if (!Array.isArray(old) || 'motherPhone' in raw) return t;
  const phones = old.filter((p): p is string => typeof p === 'string' && p.trim() !== '');
  const { parentPhones: _drop, ...rest } = t as Transport & { parentPhones?: unknown };
  void _drop;
  return { ...rest, motherPhone: phones[0] ?? '', partnerPhone: phones.slice(1).join(', ') };
}

/** Oudere concepten bewaarden de CPAP-druk als `cpap`; die wordt nu als PEEP geregistreerd. */
function migrateCpapToPeep(m: Measurement): Measurement {
  const cpap = m.resp?.settingsByMode?.cpap;
  if (!cpap || !('cpap' in cpap)) return m;
  const { cpap: pressure, ...rest } = cpap;
  return { ...m, resp: { ...m.resp, settingsByMode: { ...m.resp.settingsByMode, cpap: { ...rest, peep: rest.peep ?? pressure } } } };
}

export class LocalStorageTransportRepository implements TransportRepository {
  constructor(private storage: KeyValueStorage) {}

  private readIndex(): string[] {
    try {
      const v = JSON.parse(this.storage.getItem(INDEX_KEY) ?? '[]');
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }

  private writeIndex(ids: string[]) {
    this.storage.setItem(INDEX_KEY, JSON.stringify(ids));
  }

  list(): TransportSummary[] {
    return this.readIndex()
      .map((id) => this.load(id))
      .filter((t): t is Transport => t !== null)
      .map(summarize)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  load(id: string): Transport | null {
    const raw = this.storage.getItem(PREFIX + id);
    if (!raw) return null;
    try {
      return normalizeTransport(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  save(t: Transport): Transport {
    const saved = { ...t, updatedAt: new Date().toISOString() };
    this.storage.setItem(PREFIX + t.id, JSON.stringify(saved));
    const ids = this.readIndex();
    if (!ids.includes(t.id)) this.writeIndex([...ids, t.id]);
    return saved;
  }

  remove(id: string): void {
    this.storage.removeItem(PREFIX + id);
    this.writeIndex(this.readIndex().filter((x) => x !== id));
  }
}
