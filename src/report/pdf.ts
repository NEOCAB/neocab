import { jsPDF } from 'jspdf';
import type { Report, ReportBlock, ReportRow } from './buildReport';

export interface PdfFonts {
  /** Base64 van DejaVuSans.ttf (Unicode: subscripts, Δ, °, ⁻). */
  regular: string;
  bold: string;
}

const A4 = { w: 210, h: 297 };
const M = { left: 16, right: 16, top: 18, bottom: 18 };
const CONTENT_W = A4.w - M.left - M.right;
const LABEL_W = 62;
const FONT = 'DejaVu';
const SIZE = { body: 9.5, title: 16, section: 12.5, block: 10.5, meta: 8.5, footer: 8 };
const LINE = (pt: number) => pt * 0.3528 * 1.32; // regelhoogte in mm

/**
 * Bouwt een echt pdf-document (A4) uit het verslagmodel.
 * Lange tekst wordt over regels en pagina's afgebroken; niets wordt afgekapt.
 * Kaartblokken (meetmomenten e.d.) beginnen op een nieuwe pagina als ze niet meer passen,
 * en lopen bij uitzondering (langer dan een pagina) door met een vervolgkop.
 */
export function reportToPdf(report: Report, fonts: PdfFonts): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('DejaVuSans.ttf', fonts.regular);
  doc.addFont('DejaVuSans.ttf', FONT, 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', fonts.bold);
  doc.addFont('DejaVuSans-Bold.ttf', FONT, 'bold');
  doc.setFont(FONT, 'normal');
  doc.setProperties({ title: report.title, subject: report.meta[0] ?? '', creator: 'Neonatale transportregistratie' });

  let y = M.top;
  const bottom = A4.h - M.bottom;

  /** Titel van de kaart die over een paginagrens loopt; wordt als vervolgkop herhaald. */
  let continuation: string | null = null;
  const newPage = () => {
    doc.addPage();
    y = M.top;
    if (continuation) {
      doc.setFont(FONT, 'bold');
      doc.setFontSize(SIZE.body);
      doc.setTextColor(20, 60, 95);
      doc.text(`${continuation} (vervolg)`, M.left + 3, y + LINE(SIZE.body) * 0.75, { maxWidth: CONTENT_W - 6 });
      y += LINE(SIZE.body) + 1.5;
    }
  };
  const ensure = (h: number) => {
    if (y + h > bottom) newPage();
  };
  const split = (text: string, width: number, size: number, bold = false): string[] => {
    doc.setFont(FONT, bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    return text.split('\n').flatMap((para) => (para === '' ? [''] : (doc.splitTextToSize(para, width) as string[])));
  };
  const writeLines = (lines: string[], x: number, size: number, bold = false, color: [number, number, number] = [20, 20, 20]) => {
    const lh = LINE(size);
    for (const line of lines) {
      ensure(lh);
      doc.setFont(FONT, bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      doc.setTextColor(...color);
      doc.text(line, x, y + lh * 0.75);
      y += lh;
    }
  };

  // Titel
  writeLines(split(report.title, CONTENT_W, SIZE.title, true), M.left, SIZE.title, true, [20, 60, 95]);
  y += 1;
  for (const m of report.meta) writeLines(split(m, CONTENT_W, SIZE.meta), M.left, SIZE.meta, false, [70, 70, 70]);
  y += 3;

  const rowHeight = (row: ReportRow, width: number, labelW = LABEL_W): number => {
    const lh = LINE(SIZE.body);
    switch (row.type) {
      case 'kv':
        return Math.max(split(row.label, labelW - 3, SIZE.body, true).length, split(row.value, width - labelW, SIZE.body).length) * lh + 0.8;
      case 'para':
        return ((row.label ? split(row.label, width, SIZE.body, true).length : 0) + split(row.text, width, SIZE.body).length) * lh + 1.2;
      case 'sub':
        return LINE(SIZE.body) + 2;
      case 'note':
        return split(row.text, width, SIZE.body).length * lh + 0.8;
    }
  };

  const writeRow = (row: ReportRow, x: number, width: number, labelW = LABEL_W) => {
    const lh = LINE(SIZE.body);
    switch (row.type) {
      case 'kv': {
        const labelLines = split(row.label, labelW - 3, SIZE.body, true);
        const valueLines = split(row.value, width - labelW, SIZE.body);
        const n = Math.max(labelLines.length, valueLines.length);
        ensure(Math.min(n, 3) * lh);
        for (let i = 0; i < n; i++) {
          ensure(lh);
          doc.setTextColor(60, 60, 60);
          doc.setFont(FONT, 'bold');
          doc.setFontSize(SIZE.body);
          if (labelLines[i]) doc.text(labelLines[i], x, y + lh * 0.75);
          doc.setTextColor(15, 15, 15);
          doc.setFont(FONT, 'normal');
          if (valueLines[i]) doc.text(valueLines[i], x + labelW, y + lh * 0.75);
          y += lh;
        }
        y += 0.8;
        break;
      }
      case 'para': {
        const labelLines = row.label ? split(row.label, width, SIZE.body, true) : [];
        const textLines = split(row.text, width, SIZE.body);
        // Kopje nooit los van de tekst: minstens twee tekstregels erbij op dezelfde pagina.
        ensure((labelLines.length + Math.min(textLines.length, 2)) * lh);
        writeLines(labelLines, x, SIZE.body, true, [60, 60, 60]);
        writeLines(textLines, x, SIZE.body);
        y += 1.2;
        break;
      }
      case 'sub':
        ensure(lh * 3);
        y += 1;
        writeLines([row.text], x, SIZE.body, true, [20, 60, 95]);
        y += 1;
        break;
      case 'note':
        writeLines(split(row.text, width, SIZE.body), x, SIZE.body, false, [100, 100, 100]);
        y += 0.8;
        break;
    }
  };

  const pageH = bottom - M.top;
  const COL_GAP = 6;
  const COL_LABEL_W = 40;
  /**
   * Kaarten met meerdere subkopjes (meetmomenten) worden in twee kolommen gezet:
   * de groepen blijven in volgorde, verdeeld over links en rechts.
   */
  const twoColumns = (block: ReportBlock, width: number) => {
    if (!block.card) return null;
    const groups: ReportRow[][] = [];
    for (const r of block.rows) {
      if (r.type === 'sub' || groups.length === 0) groups.push([]);
      groups[groups.length - 1].push(r);
    }
    if (groups.length < 2) return null;
    const colW = (width - COL_GAP) / 2;
    const h = (g: ReportRow[]) => g.reduce((sum, r) => sum + rowHeight(r, colW, COL_LABEL_W), 0);
    const heights = groups.map(h);
    const total = heights.reduce((a, b) => a + b, 0);
    let best = { split: 1, height: Infinity };
    for (let k = 1; k < groups.length; k++) {
      const left = heights.slice(0, k).reduce((a, b) => a + b, 0);
      const height = Math.max(left, total - left);
      if (height < best.height) best = { split: k, height };
    }
    return { colW, left: groups.slice(0, best.split).flat(), right: groups.slice(best.split).flat(), height: best.height };
  };

  const blockMetrics = (block: ReportBlock) => {
    const pad = block.card ? 3 : 0;
    const width = CONTENT_W - pad * 2;
    const titleLines = block.title ? split(block.title, width, SIZE.block, true) : [];
    const titleH = titleLines.length * LINE(SIZE.block) + (block.title ? 1.5 : 0);
    const cols = twoColumns(block, width);
    const singleH = block.rows.reduce((sum, r) => sum + rowHeight(r, width), 0);
    const columns = cols && titleH + cols.height + pad * 2 <= pageH ? cols : null;
    const bodyH = columns ? columns.height : singleH;
    const firstRowH = block.rows[0] ? rowHeight(block.rows[0], width) : 0;
    const total = titleH + bodyH + pad * 2;
    /** Minimale ruimte om met dit blok te beginnen: kaarten zo mogelijk heel, anders kop + eerste regels. */
    const keep = block.card && total <= pageH ? total : titleH + pad + Math.min(firstRowH, LINE(SIZE.body) * 4);
    return { pad, width, titleLines, keep, columns };
  };

  const writeBlock = (block: ReportBlock) => {
    const { pad, width, titleLines, keep, columns } = blockMetrics(block);
    const x = M.left + pad;
    ensure(keep);

    const startPage = doc.getNumberOfPages();
    const startY = y;
    y += pad;
    if (block.title) {
      writeLines(titleLines, x, SIZE.block, true, [15, 15, 15]);
      y += 1.5;
    }
    continuation = block.title ?? null;
    if (columns) {
      // Past gegarandeerd op deze pagina (zie keep); beide kolommen starten op dezelfde hoogte.
      const top = y;
      for (const row of columns.left) writeRow(row, x, columns.colW, COL_LABEL_W);
      const leftEnd = y;
      y = top;
      for (const row of columns.right) writeRow(row, x + columns.colW + COL_GAP, columns.colW, COL_LABEL_W);
      y = Math.max(leftEnd, y);
      doc.setDrawColor(225, 230, 235);
      doc.setLineWidth(0.2);
      doc.line(x + columns.colW + COL_GAP / 2, top, x + columns.colW + COL_GAP / 2, y);
    } else {
      for (const row of block.rows) writeRow(row, x, width);
    }
    continuation = null;
    y += pad;
    if (block.card) {
      doc.setDrawColor(190, 200, 210);
      doc.setLineWidth(0.3);
      const endPage = doc.getNumberOfPages();
      if (endPage === startPage) {
        doc.roundedRect(M.left, startY, CONTENT_W, y - startY, 1.5, 1.5, 'S');
      } else {
        // Kaart loopt over pagina's: alleen een linkerlijn per pagina.
        for (let p = startPage; p <= endPage; p++) {
          doc.setPage(p);
          const top = p === startPage ? startY : M.top;
          const end = p === endPage ? y : bottom;
          doc.line(M.left, top, M.left, end);
        }
        doc.setPage(endPage);
      }
    }
    y += block.card ? 3 : 1;
  };

  for (const section of report.sections) {
    const titleLines = split(section.title, CONTENT_W, SIZE.section, true);
    // Kop nooit los onderaan een pagina: houd hem samen met het begin van het eerste blok.
    const firstKeep = section.blocks[0] ? blockMetrics(section.blocks[0]).keep : 0;
    ensure(titleLines.length * LINE(SIZE.section) + 5 + firstKeep);
    y += 2;
    writeLines(titleLines, M.left, SIZE.section, true, [20, 60, 95]);
    doc.setDrawColor(20, 60, 95);
    doc.setLineWidth(0.4);
    doc.line(M.left, y + 0.5, M.left + CONTENT_W, y + 0.5);
    y += 3;
    for (const block of section.blocks) writeBlock(block);
  }

  // Paginakop en -voet
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(SIZE.footer);
    doc.setTextColor(110, 110, 110);
    if (p > 1) doc.text(`${report.title}${report.meta[0] ? ` — ${report.meta[0]}` : ''}`, M.left, 10, { maxWidth: CONTENT_W });
    doc.text(`Pagina ${p} van ${pages}`, A4.w - M.right, A4.h - 8, { align: 'right' });
    doc.text('Neonatale transportregistratie — prototype', M.left, A4.h - 8);
  }
  return doc;
}

/** ASCII-bestandsnaam (sommige browsers vallen anders terug op "download"). */
export function pdfFileName(childName: string, patientNumber: string, now = new Date()): string {
  const slug = [childName, patientNumber]
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  return `transportverslag${slug ? `-${slug}` : ''}-${now.toISOString().slice(0, 10)}.pdf`;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

let fontCache: Promise<PdfFonts> | null = null;

/** Laadt de lettertypen (meegeleverd in /fonts) in de browser. */
export function loadPdfFonts(baseUrl = import.meta.env?.BASE_URL ?? './'): Promise<PdfFonts> {
  if (!fontCache) {
    const get = async (file: string) => {
      const res = await fetch(`${baseUrl}fonts/${file}`);
      if (!res.ok) throw new Error(`Lettertype ${file} kon niet worden geladen.`);
      return arrayBufferToBase64(await res.arrayBuffer());
    };
    fontCache = Promise.all([get('DejaVuSans.ttf'), get('DejaVuSans-Bold.ttf')]).then(([regular, bold]) => ({ regular, bold }));
    fontCache.catch(() => {
      fontCache = null;
    });
  }
  return fontCache;
}
