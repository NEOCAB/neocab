import { jsPDF } from 'jspdf';
import logoUrl from '../assets/neocab-logo.svg';
import type { Report, ReportBlock, ReportRow, ReportTable, ReportTableColumn } from './buildReport';

export interface PdfFonts {
  /** Base64 van PTSans-Regular.ttf (huisstijllettertype; bevat o.a. ₂, ₃, Δ, °). */
  regular: string;
  bold: string;
  /** Logo als PNG-data-URL (optioneel); rechtsboven op de eerste pagina. */
  logoPng?: string;
}

const A4 = { w: 210, h: 297 };
const M = { left: 12, right: 12, top: 18, bottom: 16 };

const LABEL_W = 62;
/** Hoogte/breedte van het logo (viewBox 21 × 17). */
const LOGO_RATIO = 17 / 21;
const FONT = 'PTSans';

/** Huisstijlkleuren (RGB). */
const C = {
  blue: [0, 60, 125] as [number, number, number], // donkerblauw, kernkleur
  blue20: [204, 216, 229] as [number, number, number], // donkerblauw 20%
  blue10: [242, 245, 249] as [number, number, number],
  line: [200, 204, 209] as [number, number, number],
  text: [26, 26, 26] as [number, number, number],
  muted: [92, 102, 112] as [number, number, number],
};

/** Tekens die PT Sans niet bevat, vervangen door een gelijkwaardige weergave. */
function pdfText(s: string): string {
  return s.replace(/⁻/g, '-').replace(/→/g, 'naar').replace(/▲/g, '');
}
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
  doc.addFileToVFS('PTSans-Regular.ttf', fonts.regular);
  doc.addFont('PTSans-Regular.ttf', FONT, 'normal');
  doc.addFileToVFS('PTSans-Bold.ttf', fonts.bold);
  doc.addFont('PTSans-Bold.ttf', FONT, 'bold');
  doc.setFont(FONT, 'normal');
  doc.setProperties({ title: report.title, subject: report.meta[0] ?? '', creator: 'Neo.Cab' });

  let y = M.top;
  /** Paginageometrie; de tijdlijntabel staat op liggende pagina's. */
  let orientation = 'portrait' as 'portrait' | 'landscape';
  let contentW = A4.w - M.left - M.right;
  let bottom = A4.h - M.bottom;

  /** Titel van de kaart die over een paginagrens loopt; wordt als vervolgkop herhaald. */
  let continuation: string | null = null;
  const newPage = (o: 'portrait' | 'landscape' = orientation) => {
    doc.addPage('a4', o);
    orientation = o;
    contentW = (o === 'landscape' ? A4.h : A4.w) - M.left - M.right;
    bottom = (o === 'landscape' ? A4.w : A4.h) - M.bottom;
    y = M.top;
    if (continuation) {
      doc.setFont(FONT, 'bold');
      doc.setFontSize(SIZE.body);
      doc.setTextColor(...C.blue);
      doc.text(pdfText(`${continuation} (vervolg)`), M.left + 3, y + LINE(SIZE.body) * 0.75, { maxWidth: contentW - 6 });
      y += LINE(SIZE.body) + 1.5;
    }
  };
  const ensure = (h: number) => {
    if (y + h > bottom) newPage();
  };
  const split = (text: string, width: number, size: number, bold = false): string[] => {
    doc.setFont(FONT, bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    return pdfText(text).split('\n').flatMap((para) => (para === '' ? [''] : (doc.splitTextToSize(para, width) as string[])));
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

  // Titel, met logo rechtsboven
  const LOGO = 17;
  const LOGO_H = LOGO * LOGO_RATIO;
  if (fonts.logoPng) doc.addImage(fonts.logoPng, 'PNG', A4.w - M.right - LOGO, M.top - 2, LOGO, LOGO_H);
  const titleW = fonts.logoPng ? contentW - LOGO - 4 : contentW;
  writeLines(split(report.title, titleW, SIZE.title, true), M.left, SIZE.title, true, C.blue);
  y += 1;
  for (const m of report.meta) writeLines(split(m, titleW, SIZE.meta), M.left, SIZE.meta, false, [70, 70, 70]);
  y = Math.max(y + 3, fonts.logoPng ? M.top - 2 + LOGO_H + 3 : 0);

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
        writeLines([row.text], x, SIZE.body, true, C.blue);
        y += 1;
        break;
      case 'note':
        writeLines(split(row.text, width, SIZE.body), x, SIZE.body, false, [100, 100, 100]);
        y += 0.8;
        break;
    }
  };

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
    const pageH = bottom - M.top;
    if (block.table) return { pad: 0, width: contentW, titleLines: [] as string[], keep: 0, columns: null };
    const pad = block.card ? 3 : 0;
    const width = contentW - pad * 2;
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

  const BASE_TS = { cell: 7, head: 6.5, group: 7 };
  const BASE_PAD = 1.1;
  const BASE_MAX_COL_W = 30;
  /** Kleinste schaal waarop de tabel nog als één geheel wordt gezet (letter ca. 5,4 pt). */
  const MIN_TABLE_SCALE = 0.77;

  /**
   * Tabel met per rij één record. Kolombreedte volgt de inhoud; past de tabel niet in de paginabreedte,
   * dan wordt hij in kolomblokken verdeeld waarbij de identificatiekolommen (#, tijd, fase) terugkomen.
   * Bij een paginawissel worden de kopregels herhaald.
   */
  const writeTable = (table: ReportTable, title?: string, scale = 1): void => {
    const TS = { cell: BASE_TS.cell * scale, head: BASE_TS.head * scale, group: BASE_TS.group * scale };
    const CELL_PAD = BASE_PAD * scale;
    const MAX_COL_W = BASE_MAX_COL_W * scale;
    const lhCell = LINE(TS.cell);
    const lhHead = LINE(TS.head);
    const headerLines = (c: ReportTableColumn) => [c.header, ...(c.unit ? [c.unit] : [])];
    const longestWord = (text: string, size: number, bold: boolean) => {
      doc.setFont(FONT, bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      return Math.max(0, ...text.split(/[\s\n]+/).map((w) => doc.getTextWidth(w)));
    };
    const lineWidth = (text: string, size: number, bold: boolean) => {
      doc.setFont(FONT, bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      return Math.max(0, ...text.split('\n').map((l) => doc.getTextWidth(l)));
    };
    // Identificatiekolommen hebben een liggende kop; de overige koppen staan verticaal (90°),
    // zodat de kolombreedte door de waarden wordt bepaald.
    const rotated = (c: ReportTableColumn) => !c.keyColumn;
    const rotatedText = (c: ReportTableColumn) => (c.unit ? `${c.header} (${c.unit})` : c.header);
    const natural = table.columns.map((c, ci) => {
      const cells = Math.max(0, ...table.rows.map((r) => lineWidth(r[ci] ?? '', TS.cell, c.keyColumn)));
      const head = rotated(c) ? LINE(TS.head) : Math.max(...headerLines(c).map((l) => longestWord(l, TS.head, true)));
      return Math.max(head, Math.min(cells, MAX_COL_W), 3.5 * scale) + CELL_PAD * 2;
    });

    // Een groep is minstens zo breed als zijn kop (bijv. "Berekend" boven alleen de OI-kolom).
    table.columns.forEach((c, ci) => {
      if (c.keyColumn || table.columns[ci + 1]?.group === c.group) return;
      let first = ci;
      while (first > 0 && table.columns[first - 1].group === c.group) first--;
      const groupW = natural.slice(first, ci + 1).reduce((a, b) => a + b, 0);
      const need = lineWidth(c.group, TS.group, true) + CELL_PAD * 2 + 0.5;
      if (groupW < need) natural[ci] += need - groupW;
    });

    // Eén tabel: past hij niet, verklein dan alles naar rato (tot MIN_TABLE_SCALE).
    const naturalTotal = natural.reduce((a, b) => a + b, 0);
    if (scale === 1 && naturalTotal > contentW) {
      const fit = (contentW / naturalTotal) * 0.995;
      if (fit >= MIN_TABLE_SCALE) return writeTable(table, title, fit);
      return writeTable(table, title, MIN_TABLE_SCALE);
    }

    // Kolomblokken (alleen bij uitzonderlijk veel gevulde kolommen) met herhaalde identificatiekolommen.
    const keyIdx = table.columns.map((c, i) => (c.keyColumn ? i : -1)).filter((i) => i >= 0);
    const dataIdx = table.columns.map((c, i) => (c.keyColumn ? -1 : i)).filter((i) => i >= 0);
    const keyW = keyIdx.reduce((sum, i) => sum + natural[i], 0);
    const chunks: number[][] = [];
    let cur: number[] = [];
    let curW = keyW;
    for (const i of dataIdx) {
      if (cur.length && curW + natural[i] > contentW) {
        chunks.push(cur);
        cur = [];
        curW = keyW;
      }
      cur.push(i);
      curW += natural[i];
    }
    if (cur.length || chunks.length === 0) chunks.push(cur);

    chunks.forEach((chunk, ci) => {
      const idx = [...keyIdx, ...chunk];
      const total = idx.reduce((sum, i) => sum + natural[i], 0);
      const extra = Math.max(0, (contentW - total) / idx.length);
      const widths = idx.map((i) => natural[i] + extra);
      const xs = widths.reduce<number[]>((acc, w, k) => [...acc, acc[k] + w], [M.left]);
      const cols = idx.map((i) => table.columns[i]);

      // Groepskoppen: aaneengesloten kolommen met dezelfde groep.
      const spans: { label: string; x: number; w: number }[] = [];
      cols.forEach((c, k) => {
        const last = spans[spans.length - 1];
        if (last && last.label === c.group) last.w += widths[k];
        else spans.push({ label: c.group, x: xs[k], w: widths[k] });
      });
      const groupLines = spans.map((sp) => split(sp.label, sp.w - CELL_PAD * 2, TS.group, true));
      const groupH = Math.max(...groupLines.map((l) => l.length)) * LINE(TS.group) + 1.5;
      const headLines = cols.map((c, k) => (rotated(c) ? [] : headerLines(c).flatMap((l) => split(l, widths[k] - CELL_PAD * 2, TS.head, true))));
      const rotatedW = cols.map((c) => (rotated(c) ? lineWidth(rotatedText(c), TS.head, true) : 0));
      const headH = Math.max(Math.max(...headLines.map((l) => l.length)) * lhHead, ...rotatedW) + CELL_PAD * 2 + 0.5;

      const drawHeader = () => {
        doc.setLineWidth(0.15);
        doc.setDrawColor(...C.line);
        doc.setFillColor(...C.blue);
        doc.rect(M.left, y, total + extra * idx.length, groupH, 'FD');
        spans.forEach((sp, k) => {
          doc.line(sp.x, y, sp.x, y + groupH + headH);
          doc.setFont(FONT, 'bold');
          doc.setFontSize(TS.group);
          doc.setTextColor(255, 255, 255); // wit op volle kernkleur
          groupLines[k].forEach((l, li) => doc.text(l, sp.x + CELL_PAD, y + 0.8 + LINE(TS.group) * (li + 0.75)));
        });
        y += groupH;
        doc.setFillColor(...C.blue20);
        doc.rect(M.left, y, total + extra * idx.length, headH, 'FD');
        cols.forEach((c, k) => {
          doc.line(xs[k], y, xs[k], y + headH);
          doc.setFont(FONT, 'bold');
          doc.setFontSize(TS.head);
          doc.setTextColor(...C.text);
          if (rotated(c)) {
            // Van onder naar boven, onderaan uitgelijnd.
            doc.text(rotatedText(c), xs[k] + widths[k] / 2 + TS.head * 0.3528 * 0.35, y + headH - CELL_PAD, { angle: 90 });
          } else {
            const n = headLines[k].length;
            headLines[k].forEach((l, li) => doc.text(l, xs[k] + CELL_PAD, y + headH - CELL_PAD - lhHead * (n - 1 - li) - lhHead * 0.25));
          }
        });
        doc.line(xs[xs.length - 1], y - groupH, xs[xs.length - 1], y + headH);
        y += headH;
      };

      const label = `${title ?? 'Tijdlijn'}${chunks.length > 1 ? ` — kolommen deel ${ci + 1} van ${chunks.length}` : ''}`;
      if (title || chunks.length > 1) {
        ensure(LINE(SIZE.block) + groupH + headH + lhCell * 2 + 4);
        writeLines([label], M.left, SIZE.block, true, [15, 15, 15]);
        y += 1;
      } else ensure(groupH + headH + lhCell * 2 + 4);
      drawHeader();

      table.rows.forEach((row, ri) => {
        const cellLines = idx.map((i, k) => split(row[i] ?? '', widths[k] - CELL_PAD * 2, TS.cell));
        const h = Math.max(1, ...cellLines.map((l) => l.length)) * lhCell + 1.4;
        // Toelichtingsrij (beleidsaanpassingen) onder dezelfde tijd, over de volle breedte naast de tijdkolom.
        const note = table.notes?.[ri] ?? '';
        const noteX = xs[keyIdx.length];
        const noteW = xs[xs.length - 1] - noteX;
        const noteLines = note ? split(note, noteW - CELL_PAD * 2, TS.cell) : [];
        const noteH = noteLines.length ? noteLines.length * lhCell + 1.4 : 0;
        if (y + h + noteH > bottom) {
          continuation = label;
          newPage();
          continuation = null;
          drawHeader();
        }
        if (ri % 2 === 1) {
          doc.setFillColor(...C.blue10);
          doc.rect(M.left, y, total + extra * idx.length, h, 'F');
        }
        doc.setDrawColor(...C.line);
        doc.setLineWidth(0.1);
        cols.forEach((c, k) => {
          const alert = table.alerts?.[ri]?.[idx[k]] ?? false;
          if (alert) {
            // Oranje alert (bijv. OI > 25).
            doc.setFillColor(255, 224, 184);
            doc.setDrawColor(224, 123, 0);
            doc.setLineWidth(0.5);
            doc.rect(xs[k] + 0.25, y + 0.25, widths[k] - 0.5, h - 0.5, 'FD');
            doc.setDrawColor(...C.line);
            doc.setLineWidth(0.1);
          }
          doc.line(xs[k], y, xs[k], y + h);
          doc.setFont(FONT, c.keyColumn || alert ? 'bold' : 'normal');
          doc.setFontSize(TS.cell);
          if (alert) doc.setTextColor(122, 60, 0);
          else doc.setTextColor(...C.text);
          cellLines[k].forEach((l, li) => doc.text(l, xs[k] + CELL_PAD, y + 0.7 + lhCell * (li + 0.75)));
        });
        doc.line(xs[xs.length - 1], y, xs[xs.length - 1], y + h);
        // Met beleidsaanpassingen loopt de tijdcel door over beide rijen.
        doc.line(noteLines.length ? noteX : M.left, y + h, xs[xs.length - 1], y + h);
        y += h;
        if (noteLines.length) {
          // Zelfde achtergrond als de rij erboven.
          if (ri % 2 === 1) {
            doc.setFillColor(...C.blue10);
            doc.rect(M.left, y, xs[xs.length - 1] - M.left, noteH, 'F');
          }
          doc.setDrawColor(...C.line);
          doc.setLineWidth(0.1);
          for (let k = 0; k <= keyIdx.length; k++) doc.line(xs[k], y, xs[k], y + noteH);
          doc.line(xs[xs.length - 1], y, xs[xs.length - 1], y + noteH);
          doc.line(M.left, y + noteH, xs[xs.length - 1], y + noteH);
          doc.setFontSize(TS.cell);
          doc.setTextColor(...C.text);
          doc.setFont(FONT, 'normal');
          noteLines.forEach((l, li) => doc.text(l, noteX + CELL_PAD, y + 0.7 + lhCell * (li + 0.75)));
          y += noteH;
        }
      });
      y += 4;
    });
  };

  const writeBlock = (block: ReportBlock) => {
    if (block.table) return writeTable(block.table, block.title);
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
      doc.setDrawColor(...C.line);
      doc.setLineWidth(0.3);
      const endPage = doc.getNumberOfPages();
      if (endPage === startPage) {
        doc.roundedRect(M.left, startY, contentW, y - startY, 1.5, 1.5, 'S');
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
    const hasTable = section.blocks.some((b) => b.table);
    if (hasTable && orientation !== 'landscape') newPage('landscape');
    else if (!hasTable && orientation !== 'portrait') newPage('portrait');
    const titleLines = split(section.title, contentW, SIZE.section, true);
    // Kop nooit los onderaan een pagina: houd hem samen met het begin van het eerste blok.
    const firstKeep = section.blocks[0] ? blockMetrics(section.blocks[0]).keep : 0;
    ensure(titleLines.length * LINE(SIZE.section) + 5 + firstKeep);
    y += 2;
    writeLines(titleLines, M.left, SIZE.section, true, C.blue);
    doc.setDrawColor(...C.blue);
    doc.setLineWidth(0.4);
    doc.line(M.left, y + 0.5, M.left + contentW, y + 0.5);
    y += 3;
    if (section.subtitle) {
      writeLines(split(section.subtitle, contentW, SIZE.meta), M.left, SIZE.meta, false, C.muted);
      y += 1.5;
    }
    for (const block of section.blocks) writeBlock(block);
  }

  // Paginakop en -voet
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(SIZE.footer);
    doc.setTextColor(...C.muted);
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    if (p > 1) doc.text(pdfText(`${report.title}${report.meta[0] ? ` — ${report.meta[0]}` : ''}`), M.left, 10, { maxWidth: pw - M.left - M.right });
    doc.text(`Pagina ${p} van ${pages}`, pw - M.right, ph - 8, { align: 'right' });
    doc.text('Neo.Cab — prototype', M.left, ph - 8);
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
    fontCache = Promise.all([get('PTSans-Regular.ttf'), get('PTSans-Bold.ttf')]).then(([regular, bold]) => ({ regular, bold }));
    fontCache.catch(() => {
      fontCache = null;
    });
  }
  return fontCache;
}

let logoCache: Promise<string | undefined> | null = null;

/** Zet het logo (svg) in de browser om naar een png voor de pdf. Lukt dat niet, dan zonder logo. */
export function loadPdfLogo(px = 420): Promise<string | undefined> {
  if (!logoCache) {
    logoCache = new Promise<string | undefined>((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = px;
          canvas.height = Math.round(px * LOGO_RATIO);
          canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(undefined);
        }
      };
      img.onerror = () => resolve(undefined);
      img.src = logoUrl;
    });
  }
  return logoCache;
}
