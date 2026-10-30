import { useMemo, useRef, useState } from 'react';
import type { Transport } from '../domain/types';
import { buildReport, type ReportRow } from '../report/buildReport';
import { emailSubject, reportToHtml, reportToText } from '../report/text';
import { childLabel, useAnonymous, useTimeZone } from './context';
import { DataTable } from './DataTable';
import { Logo, SectionIcon } from './icons';
import { canPrint, offerFile } from './viewer';
import { encodeHandover, handoverEmail, handoverFileName } from '../storage/handover';

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

/**
 * Opgemaakte tekst naar het klembord (HTML met vet/cursief/onderstreept, plus platte tekst als terugval),
 * zodat plakken in een mailprogramma, tekstverwerker of EPD de opmaak behoudt.
 */
async function copyRich(html: string, text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      return true;
    }
  } catch {
    // val terug op execCommand
  }
  // Terugval (ook zonder https): bij het kopieer-event beide vormen zelf op het klembord zetten.
  const onCopy = (e: ClipboardEvent) => {
    e.clipboardData?.setData('text/html', html);
    e.clipboardData?.setData('text/plain', text);
    e.preventDefault();
  };
  document.addEventListener('copy', onCopy);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  } finally {
    document.removeEventListener('copy', onCopy);
  }
  return ok || copyText(text);
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
  const anonymous = useAnonymous();
  const text = useMemo(() => reportToText(report), [report]);
  const html = useMemo(() => reportToHtml(report), [report]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  /** Selecteert de opgemaakte tekst, zodat die met Ctrl/Cmd+C (mét opmaak) gekopieerd kan worden. */
  const selectText = () => {
    const el = textRef.current;
    const sel = window.getSelection();
    if (!el || !sel) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const downloadPdf = async () => {
    setBusy(true);
    setStatus('Pdf wordt gemaakt…');
    try {
      const { loadPdfFonts, loadPdfLogo, pdfFileName, reportToPdf } = await import('../report/pdf');
      const [fonts, logoPng] = await Promise.all([loadPdfFonts(), loadPdfLogo()]);
      const doc = reportToPdf(report, { ...fonts, logoPng });
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
    const ok = await copyRich(html, text);
    if (ok) setStatus('Volledige e-mailtekst met opmaak gekopieerd. Plak die in een e-mail, document of het EPD.');
    else {
      selectText();
      setStatus('Automatisch kopiëren lukt niet in deze browser. De tekst hieronder is geselecteerd; kopieer met Ctrl/Cmd+C.');
    }
  };

  const openMail = async () => {
    const subject = emailSubject(report);
    const fits = encodeURIComponent(text).length <= MAILTO_BODY_LIMIT;
    // Altijd eerst de volledige opgemaakte tekst naar het klembord: een mailto-link kan geen opmaak meegeven
    // en wordt soms afgekapt; openen van het mailprogramma lukt bovendien niet op elk apparaat.
    const copied = await copyRich(html, text);
    const body = copied
      ? 'Het volledige transportverslag staat op het klembord. Plak het hier (Ctrl/Cmd+V); de opmaak blijft dan behouden.'
      : fits
        ? text
        : 'Kopieer het volledige transportverslag uit de app en plak het hier.';
    setStatus(
      copied
        ? 'De volledige tekst met opmaak staat op het klembord. Plak die in de e-mail (ook als het mailprogramma niet vanzelf opent). Er wordt niets automatisch verzonden.'
        : 'Kopiëren lukte niet; kopieer de tekst uit het tekstvak hieronder. Er wordt niets automatisch verzonden.',
    );
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  /** Overdracht aan een collega: volledige registratie als code in een e-mail of als bestand. */
  const [handoverStatus, setHandoverStatus] = useState<string | null>(null);
  const handoverMail = async () => {
    const { subject, body } = handoverEmail(transport, await encodeHandover(transport));
    const fits = encodeURIComponent(body).length <= MAILTO_BODY_LIMIT;
    const copied = await copyText(body);
    const mailBody = fits
      ? body
      : copied
        ? 'De overdracht staat op het klembord. Plak die hier (Ctrl/Cmd+V) en verstuur het bericht zelf.'
        : 'Kopiëren lukte niet. Download in Neo.Cab het overdrachtsbestand en voeg dat als bijlage toe.';
    setHandoverStatus(
      copied
        ? 'De overdracht (uitleg en code) staat op het klembord. Plak die in de e-mail als het mailprogramma niet vanzelf opent of de tekst ontbreekt. Er wordt niets automatisch verzonden.'
        : 'Kopiëren lukte niet. Download het overdrachtsbestand en voeg dat als bijlage toe. Er wordt niets automatisch verzonden.',
    );
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mailBody)}`;
  };
  const handoverFile = async () => {
    const { body } = handoverEmail(transport, await encodeHandover(transport));
    const result = await offerFile(handoverFileName(transport), new Blob([body], { type: 'text/plain;charset=utf-8' }));
    setHandoverStatus(
      result === 'saved'
        ? 'Overdrachtsbestand gemaakt. Voeg het als bijlage toe aan een e-mail; de ontvanger opent het via “Transport importeren”.'
        : result === 'declined'
          ? 'Opslaan van het overdrachtsbestand is geannuleerd.'
          : 'Bestand opslaan is in deze weergave niet beschikbaar. Gebruik “Overdracht per e-mail”.',
    );
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
            <strong>{childLabel(transport.child.name, anonymous)}</strong>
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
            Er wordt nooit automatisch een e-mail verzonden. De e-mailtekst wordt mét opmaak (vet, cursief, onderstreept) naar het klembord gekopieerd; plak die in de e-mail, een document of het EPD. Een concept via het mailprogramma bevat géén pdf-bijlage: download de pdf en voeg die zelf toe.
          </p>
          {status && (
            <p className="notice" role="status">
              {status}
            </p>
          )}
        </section>

        <section className="export-actions handover no-print" aria-label="Overdragen aan een collega">
          <h2>Overdragen aan een collega</h2>
          <p>Stuur de volledige registratie door, zodat een collega die op een ander apparaat verder kan invullen via “Transport importeren” op de startpagina.</p>
          <div className="button-row">
            <button type="button" className="primary" onClick={handoverMail}>
              Overdracht per e-mail
            </button>
            <button type="button" className="secondary" onClick={handoverFile}>
              Overdrachtsbestand downloaden
            </button>
          </div>
          <p className="muted small-print">Het bericht bevat alle ingevulde gegevens, inclusief patiëntgegevens. Er wordt niets automatisch verzonden.</p>
          {handoverStatus && (
            <p className="notice" role="status">
              {handoverStatus}
            </p>
          )}
        </section>

        <article className="report" aria-label="Transportverslag">
          <div className="report-head">
            <h1>{report.title}</h1>
            <Logo className="report-logo" />
          </div>
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
          <h2 id="email-text-title">Volledige e-mailtekst</h2>
          {/* Zelf opgebouwde HTML met alleen geëscapete tekst en vaste opmaak (zie reportToHtml). */}
          <div id="email-text" className="email-preview" ref={textRef} tabIndex={0} role="document" aria-labelledby="email-text-title" dangerouslySetInnerHTML={{ __html: html }} />
        </section>
      </main>
    </div>
  );
}
