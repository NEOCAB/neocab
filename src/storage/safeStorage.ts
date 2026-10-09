import type { KeyValueStorage } from './localRepository';

/**
 * localStorage als dat beschikbaar is; anders (privévenster, geblokkeerde sitegegevens) een opslag in het geheugen.
 * `persistent` geeft aan of gegevens een herlaadbeurt overleven.
 */
export function safeStorage(): { storage: KeyValueStorage; persistent: boolean } {
  try {
    const ls = window.localStorage;
    const probe = '__neonataal_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return {
      persistent: true,
      storage: {
        getItem: (k) => {
          try {
            return ls.getItem(k);
          } catch {
            return null;
          }
        },
        setItem: (k, v) => ls.setItem(k, v),
        removeItem: (k) => {
          try {
            ls.removeItem(k);
          } catch {
            /* negeren */
          }
        },
      },
    };
  } catch {
    const mem = new Map<string, string>();
    return {
      persistent: false,
      storage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) },
    };
  }
}
