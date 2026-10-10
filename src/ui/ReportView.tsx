import { useMemo, useRef, useState } from 'react';
import type { Transport } from '../domain/types';
import { buildReport, type ReportRow } from '../report/buildReport';
import { emailSubject, reportToText } from '../report/text';
import { useTimeZone } from './context';
import { DataTable } from './DataTable';
import { SectionIcon } from './icons';
import { canPrint, offerFile } from './viewer';

/** Mailto-links worden door sommige mailprogramma's afgekapt; boven deze lengte gaat de tekst alleen via het klembord. */
const MAILTO_BODY_LIMIT = 1800;

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // val terug op execCommand
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

function Row({ row }: { row: ReportRow }) {
  switch (row.type) {
    case 'kv':
      return (
        <div className="r-kv">
          <dt>{row.label}</dt>
          <dd className="pre">{row.value}</dd>
        </div>
      );
    case 'para':
      return (
        <div className="r-para">
          {row.label && <dt>{row.label}</dt>}
          <dd className="pre">{row.text}</dd>
        </div>
      );
    case 'sub':
      return <h5 className="r-sub">{row.text}</h5>;
    case 'note':
      return <p className="muted">{row.text}</p>;
  }
}

export function ReportView({ transport, onBack }: { transport: Transport; onBack: () => void }) {
  const tz = useTimeZone();
  const report = useMemo(() => buildReport(transport, tz), [transport, tz]);
  const text = useMemo(() => reportToText(report), [report]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const downloadPdf = async () => {
    setBusy(true);
    setStatus('Pdf wordt gemaakt…');
    try {
      const { loadPdfFonts, pdfFileName, reportToPdf } = await import('../report/pdf');
      const fonts = await loadPdfFonts();
      const doc = reportToPdf(report, fonts);
      const pages = doc.getNumberOfPages();
      const result = await offerFile(pdfFileName(transport.child.name, transport.child.patientNumber), doc.output('blob'));
      setStatus(
        result === 'saved'
          ? `Pdf gemaakt (${pages} pagina's, A4).`
          : result === 'declined'
            ? 'Opslaan van de pdf is geannuleerd.'
            : 'Pdf opslaan is in deze weergave niet beschikbaar. Kopieer de e-mailtekst of open de app lokaal.',
      );
    } catch (e) {
      setStatus(`Pdf maken is mislukt: ${e instanceof Error ? e.message : 'onbekende fout'}`);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    const ok = await copyText(text);
    if (ok) setStatus(`Volledige e-mailtekst gekopieerd (${text.length.toLocaleString('nl-NL')} tekens).`);
    else {
      textRef.current?.focus();
      textRef.current?.select();
      setStatus('Automatisch kopiëren lukt niet in deze browser. De tekst hieronder is geselecteerd; kopieer met Ctrl/Cmd+C.');
    }
  };

  const openMail = async () => {
    const subject = emailSubject(report);
    const fits = encodeURIComponent(text).length <= MAILTO_BODY_LIMIT;
    // Altijd eerst de volledige tekst naar het klembord: openen van het mailprogramma lukt niet op elk apparaat.
    const copied = await copyText(text);
    const body = fits
      ? text
      : copied
        ? 'Het volledige transportverslag staat op het klembord. Plak het hier (Ctrl/Cmd+V).'
        : 'Kopieer het volledige transportverslag uit de app en plak het hier.';
    setStatus(
      copied
        ? 'De volledige tekst staat op het klembord. Als het mailprogramma niet opent, plak de tekst dan zelf in een nieuwe e-mail. Er wordt niets automatisch verzonden.'
        : 'Kopiëren lukte niet; kopieer de tekst uit het tekstvak hieronder. Er wordt niets automatisch verzonden.',
    );
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="report-layout">
      <header className="topbar no-print">
        <div className="topbar-row">
          <button type="button" className="ghost" onClick={onBack}>
            ← Terug naar formulier
          </button>
          <div className="active-transport">
            <span className="active-label">Verslag van</span>
            <strong>{transport.child.name || 'Naam kind niet ingevuld'}</strong>
          </div>
        </div>
      </header>
      <main className="report-main">
        <section className="export-actions no-print" aria-label="Exporteren">
          <h2>Exporteren</h2>
          <div className="button-row">
            <button type="button" className="primary" onClick={downloadPdf} disabled={busy}>
              Pdf downloaden
            </button>
            <button type="button" className="primary" onClick={copy}>
              E-mailtekst kopiëren
            </button>
            <button type="button" className="secondary" onClick={openMail}>
              Concept openen in mailprogramma
            </button>
            {canPrint() && (
              <button type="button" className="secondary" onClick={() => window.print()}>
                Afdrukken
              </button>
            )}
          </div>
          <p className="muted small-print">
            Er wordt nooit automatisch een e-mail verzonden. Een concept via het mailprogramma bevat géén pdf-bijlage: download de pdf en voeg die zelf toe. Bij een lang verslag gaat de volledige tekst via het klembord, zodat er niets wegvalt.
          </p>
          {status && (
            <p className="notice" role="status">
              {status}
            </p>
          )}
        </section>

        <article className="report" aria-label="Transportverslag">
          <h1>{report.title}</h1>
          {report.meta.map((m, i) => (
            <p key={i} className={i === 0 ? 'report-patient' : 'muted small-print'}>
              {m}
            </p>
          ))}
          {report.sections.map((s) => (
            <section key={s.title} className="r-section">
              <h2 className="section-title">
                <SectionIcon title={s.title} />
                <span>{s.title}</span>
              </h2>
              {s.subtitle && <p className="section-intro">{s.subtitle}</p>}
              {s.blocks.map((b, i) => (
                <div key={i} className={b.card ? 'r-card' : 'r-block'}>
                  {b.title && <h3>{b.title}</h3>}
                  {b.table && <DataTable table={b.table} caption={`${s.title}: één rij per meetmoment`} />}
                  <dl>
                    {b.rows.map((r, j) => (
                      <Row key={j} row={r} />
                    ))}
                  </dl>
                </div>
              ))}
            </section>
          ))}
        </article>

        <section className="no-print email-text">
          <h2>
            <label htmlFor="email-text">Volledige e-mailtekst</label>
          </h2>
          <textarea id="email-text" ref={textRef} readOnly value={text} rows={14} />
        </section>
      </main>
    </div>
  );
}
