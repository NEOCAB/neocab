import { useMemo, useRef, useState } from 'react';
import type { Transport } from '../domain/types';
import { buildReport, type ReportRow } from '../report/buildReport';
import { emailSubject, reportToRtf, reportToText } from '../report/text';
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

/** Bestandsnaam voor het RTF-verslag, zoals die van de pdf. */
function rtfFileName(childName: string, patientNumber: string, now = new Date()): string {
  const slug = [childName, patientNumber]
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  return `transportverslag${slug ? `-${slug}` : ''}-${now.toISOString().slice(0, 10)}.rtf`;
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
  const rtf = useMemo(() => reportToRtf(report), [report]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

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

  /** RTF-bestand met opmaak: te openen in Word of WordPad en van daaruit te kopiëren naar het EPD (bijv. HiX). */
  const downloadRtf = async () => {
    const name = rtfFileName(transport.child.name, transport.child.patientNumber);
    const result = await offerFile(name, new Blob([rtf], { type: 'application/rtf' }));
    setStatus(
      result === 'saved'
        ? 'Rtf-bestand gemaakt. Open het in Word of WordPad, selecteer alles en kopieer het naar het EPD; de opmaak blijft dan behouden.'
        : result === 'declined'
          ? 'Opslaan van het rtf-bestand is geannuleerd.'
          : 'Bestand opslaan is in deze weergave niet beschikbaar. Open de app lokaal.',
    );
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
            <button type="button" className="secondary" onClick={downloadRtf}>
              Rtf downloaden
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
            Er wordt nooit automatisch een e-mail verzonden. Een concept via het mailprogramma bevat géén pdf-bijlage: download de pdf en voeg die zelf toe. Bij een lang verslag gaat de volledige tekst via het klembord, zodat er niets wegvalt. Met opmaak (vet, cursief) in het EPD: download het rtf-bestand, open het in Word of WordPad en kopieer het van daaruit.
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
          <h2>
            <label htmlFor="email-text">Volledige e-mailtekst</label>
          </h2>
          <textarea id="email-text" ref={textRef} readOnly value={text} rows={14} />
        </section>
      </main>
    </div>
  );
}
