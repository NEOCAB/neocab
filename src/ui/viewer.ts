/** Minimale typering van de claude.ai-artifactviewer (alleen aanwezig als de app daar draait). */
interface ClaudeDownloads {
  save(req: { filename: string; data: Blob | ArrayBuffer | string }): Promise<{ status: 'saved' | 'delivered' }>;
}
interface ClaudeViewer {
  use(name: 'downloads'): Promise<ClaudeDownloads | null>;
}

export function viewer(): ClaudeViewer | null {
  const c = (window as unknown as { claude?: ClaudeViewer }).claude;
  return c && typeof c.use === 'function' ? c : null;
}

/** In de ingebedde viewer kan de pagina zelf niet afdrukken. */
export function canPrint(): boolean {
  return viewer() === null;
}

/** Biedt een bestand aan: via de viewer als die er is, anders als gewone browserdownload. */
export async function offerFile(filename: string, blob: Blob): Promise<'saved' | 'declined' | 'unavailable'> {
  const v = viewer();
  if (v) {
    const downloads = await v.use('downloads').catch(() => null);
    if (!downloads) return 'unavailable';
    try {
      await downloads.save({ filename, data: blob });
      return 'saved';
    } catch (e) {
      const code = (e as { code?: string })?.code;
      return code === 'declined' ? 'declined' : 'unavailable';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'saved';
}
