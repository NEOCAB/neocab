import type { AbcdNotes, BloodGasCord, Infusion, Instant, Measurement, MedicationAdministration, Num, ThompsonScore, Transport, Asphyxia, TubeVersion } from '../domain/types';
import { ABCD_KEYS } from '../domain/types';
import {
  ABCD_LABELS,
  CORTICO_OPTIONS,
  LINE_TYPE_LABELS,
  TUBE_ROUTE_OPTIONS,
  VITAMIN_K_OPTIONS,
  YES_NO_UNKNOWN_OPTIONS,
  optionLabel,
  tubeDepthLabel,
} from '../domain/labels';
import { formatNum } from '../domain/num';
import { compareInstants, DEFAULT_TIME_ZONE, formatInstant, formatLocalDate } from '../domain/time';
import { correctedAge, formatGestation, transportDate } from '../domain/calc';
import { sortedRates, sortedVersions } from '../domain/timeline';
import { GAS_TYPE_LEGEND, TIMELINE_GROUP_LABELS, hasGas, timelineTable } from '../domain/timelineTable';
import { OI_ALERT_THRESHOLD, OI_FORMULA, oxygenationIndex } from '../domain/oi';
import { ASPHYXIA_CRITERIA } from '../domain/asphyxia';
import { THOMPSON_ITEMS, thompsonItemText, thompsonTotalText } from '../domain/thompson';

export type ReportRow =
  | { type: 'kv'; label: string; value: string }
  | { type: 'para'; label?: string; text: string }
  | { type: 'sub'; text: string }
  | { type: 'note'; text: string };

export interface ReportTableColumn {
  /** Korte kop. */
  header: string;
  /** Volledige naam (e-mailtekst). */
  fullLabel: string;
  unit: string;
  /** Identificatiekolom (#, tijd, fase): wordt bij opsplitsen van brede tabellen herhaald. */
  keyColumn: boolean;
  /** Kolomgroep (bovenste kopregel), bijv. "Ademhalingsondersteuning". */
  group: string;
}

/** Tabel: elke rij is één record (bijv. één meetmoment). Lege cel = '' (niet ingevuld). */
export interface ReportTable {
  columns: ReportTableColumn[];
  rows: string[][];
  /** Cellen met een alert (oranje), zelfde vorm als `rows`. */
  alerts?: boolean[][];
  /** Toelichtingsrij per rij (bijv. beleidsaanpassingen), getoond als aparte rij onder dezelfde tijd. */
  notes?: string[];
  /** Label van de toelichtingsrij. */
  noteLabel?: string;
  /**
   * Eenvoudige tabel (medicatie, infusen): geen kopregel met groepen, liggende kolomkoppen, tekst in cellen mag
   * afbreken; in de pdf op een staande pagina.
   */
  simple?: boolean;
  /** Naam van één rij in de e-mailtekst (standaard "Meetmoment"). */
  rowLabel?: string;
}

export interface ReportBlock {
  title?: string;
  /** Tabelblok; `rows` is dan leeg. */
  table?: ReportTable;
  /** Kaart-blok (meetmoment, infuus, ...): bij voorkeur niet over een pagina verdelen. */
  card?: boolean;
  rows: ReportRow[];
}

export interface ReportSection {
  title: string;
  /** Toelichting onder de kop. */
  subtitle?: string;
  blocks: ReportBlock[];
}

export interface Report {
  title: string;
  meta: string[];
  sections: ReportSection[];
}

const NOT_FILLED: ReportRow = { type: 'note', text: 'Niet ingevuld.' };

class RowBuilder {
  rows: ReportRow[] = [];
  kv(label: string, value: string | null | undefined) {
    if (value !== null && value !== undefined && value.trim() !== '') this.rows.push({ type: 'kv', label, value });
    return this;
  }
  num(label: string, v: Num, unit = '') {
    return this.kv(label, formatNum(v, unit));
  }
  para(label: string | undefined, text: string) {
    if (text.trim() !== '') this.rows.push({ type: 'para', label, text: text.replace(/\s+$/, '') });
    return this;
  }
  sub(text: string) {
    this.rows.push({ type: 'sub', text });
    return this;
  }
  note(text: string) {
    this.rows.push({ type: 'note', text });
    return this;
  }
  orEmpty(): ReportRow[] {
    return this.rows.length > 0 ? this.rows : [NOT_FILLED];
  }
}

function abcdRows(notes: AbcdNotes): ReportRow[] {
  const b = new RowBuilder();
  for (const k of ABCD_KEYS) b.para(ABCD_LABELS[k], notes[k]);
  return b.rows;
}

function asphyxiaRows(a: Asphyxia): ReportRow[] {
  const b = new RowBuilder();
  // Volgorde zoals in het protocol.
  b.kv('Criteria', ASPHYXIA_CRITERIA.filter((c) => a.criteria.includes(c.key)).map((c) => c.label).join('\n'));
  return b.orEmpty();
}

function thompsonRows(th: ThompsonScore, fi: (i: string | null) => string): ReportRow[] {
  const b = new RowBuilder();
  b.kv('Tijdstip score', fi(th.at));
  for (const item of THOMPSON_ITEMS) b.kv(item.label, thompsonItemText(item.key, th.scores[item.key]));
  b.kv('Totale score', thompsonTotalText(th.scores));
  return b.orEmpty();
}

function cordGas(b: RowBuilder, title: string, g: BloodGasCord) {
  const parts = [
    formatNum(g.ph) !== null ? `pH ${formatNum(g.ph)}` : null,
    formatNum(g.be, 'mmol/L') !== null ? `BE ${formatNum(g.be, 'mmol/L')}` : null,
    formatNum(g.lactate, 'mmol/L') !== null ? `lactaat ${formatNum(g.lactate, 'mmol/L')}` : null,
  ].filter(Boolean);
  b.kv(title, parts.join('; '));
}

export function buildReport(t: Transport, timeZone: string = DEFAULT_TIME_ZONE, generatedAt: number = Date.now()): Report {
  const fi = (i: string | null) => formatInstant(i, timeZone);
  const sections: ReportSection[] = [];

  // Basisgegevens kind
  {
    const c = t.child;
    const b = new RowBuilder();
    b.kv('Naam kind', c.name)
      .kv('Patiëntnummer', c.patientNumber)
      .kv('Geboortedatum', formatLocalDate(c.birthDate))
      .kv('Geboortetijd', c.birthTime)
      .kv('Amenorroeduur', formatGestation(c.gestationalAgeWeeks, c.gestationalAgeDays));
    const td = transportDate(t, timeZone);
    const ca = correctedAge(c, td);
    if (ca) {
      b.kv('Gecorrigeerde leeftijd', `${ca.weeks}+${ca.days} weken (op ${formatLocalDate(td)}, datum verwijzing)`);
      b.kv('Postnatale leeftijd', `dag ${ca.postnatalDay}`);
    }
    b.num('Geboortegewicht', c.birthWeightGram, 'g').num('Huidig gewicht', c.currentWeightGram, 'g');
    sections.push({ title: 'Basisgegevens kind', blocks: [{ rows: b.orEmpty() }] });
  }

  // Herkomst en bestemming
  {
    const r = t.referral;
    const b = new RowBuilder();
    b.kv('Verwijzing', fi(r.referredAt))
      .kv('Verwijzend ziekenhuis', r.referringHospital)
      .kv('Verwijzende afdeling', r.referringDepartment)
      .kv('Naam verwijzer', r.referrerName)
      .kv('Telefoonnummer verwijzer', r.referrerPhone)
      .kv('Ontvangende afdeling', r.receivingDepartment)
      .kv('Ontvangend ziekenhuis', r.receivingHospital)
      .para('Reden van overplaatsing', [r.therapeuticHypothermia ? 'Therapeutische hypothermie' : '', r.reason.trim()].filter(Boolean).join('\n'));
    sections.push({ title: 'Herkomst en bestemming', blocks: [{ rows: b.orEmpty() }] });
  }

  // Verwijzing: zwangerschap en geboorte, toestand bij verwijzing
  {
    const g = t.birth;
    const b = new RowBuilder();
    b.para('Maternale en antenatale voorgeschiedenis', g.maternalHistory)
      .kv('Antenatale corticosteroïden', optionLabel(CORTICO_OPTIONS, g.antenatalCorticosteroids))
      .kv('Antenataal magnesiumsulfaat', optionLabel(YES_NO_UNKNOWN_OPTIONS, g.antenatalMagnesium))
      .para('Reanimatie bij geboorte', g.resuscitation)
      .num('Apgar 1 minuut', g.apgar1)
      .num('Apgar 5 minuten', g.apgar5)
      .num('Apgar 10 minuten', g.apgar10);
    cordGas(b, 'Arterieel navelstrengbloedgas', g.cordArterial);
    cordGas(b, 'Veneus navelstrengbloedgas', g.cordVenous);
    b.kv('Vitamine K', g.vitaminK === 'anders' ? `Anders${g.vitaminKOther.trim() ? `: ${g.vitaminKOther.trim()}` : ''}` : optionLabel(VITAMIN_K_OPTIONS, g.vitaminK));
    const condition = abcdRows(t.referralCondition.notes);
    // Advies is optioneel: het blok verschijnt alleen als er advies is ingevuld.
    const advice = new RowBuilder();
    advice.para('Advies bij verwijzing', t.referralCondition.advice);
    sections.push({
      title: 'Verwijzing',
      blocks: [
        { title: 'Zwangerschap en geboorte', rows: b.orEmpty() },
        { title: 'Toestand bij verwijzing', rows: condition.length ? condition : [NOT_FILLED] },
        ...(t.referral.therapeuticHypothermia ? [{ title: 'Perinatale asfyxie', rows: asphyxiaRows(t.referralCondition.asphyxia) }] : []),
        ...(t.referral.therapeuticHypothermia ? [{ title: 'Thompson Score', rows: thompsonRows(t.referralCondition.thompson, fi) }] : []),
        ...(advice.rows.length ? [{ title: 'Advies', rows: advice.rows }] : []),
      ],
    });
  }

  // Dispatch
  {
    const b = new RowBuilder();
    b.kv('Ambulance aangevraagd', fi(t.dispatch.ambulanceCalledAt)).kv('Vertrek transportteam', fi(t.dispatch.departedWithAmbulanceAt)).kv('Aankomst bij kind', fi(t.teamAssessment.arrivedAt));
    sections.push({ title: 'Dispatch', blocks: [{ rows: b.orEmpty() }] });
  }

  // Stabilisatie (aankomst bij kind staat bij Dispatch)
  {
    const a = t.teamAssessment;
    const b = new RowBuilder();
    b.rows.push(...abcdRows(a.notes));
    b.para('Werkdiagnose', a.workingDiagnosis).para('Stabilisatieplan', a.stabilisationPlan).kv('Laatste voeding', fi(a.lastFeedAt));
    sections.push({ title: 'Stabilisatie', blocks: [{ rows: b.orEmpty() }] });
  }

  // Tijdlijn: één tabel, elke rij is één meetmoment
  {
    const { table, rows } = timelineReportTable(t.measurements, timeZone);
    sections.push({
      title: 'Tijdlijn',
      subtitle: 'Ademhalingsondersteuning, monitorgegevens en bloedgassen',
      blocks: rows.length
        ? [
            { rows: [], table },
            {
              rows: [
                ...(rows.some(hasGas) ? [{ type: 'note' as const, text: GAS_TYPE_LEGEND }] : []),
                ...(rows.some((m) => oxygenationIndex(m) !== null) ? [{ type: 'note' as const, text: `${OI_FORMULA}. Oranje gemarkeerd: OI > ${OI_ALERT_THRESHOLD}.` }] : []),
              ],
            },
          ].filter((b) => b.table || b.rows.length)
        : [{ rows: [{ type: 'note', text: 'Geen meetmomenten geregistreerd.' }] }],
    });
  }

  // Overige diagnostiek
  {
    const b = new RowBuilder();
    b.para('Overige laboratoriumuitslagen', t.otherLabs).para('Beeldvorming en overige onderzoeken', t.imaging);
    sections.push({ title: 'Overige diagnostiek', blocks: [{ rows: b.orEmpty() }] });
  }

  // Plastic
  {
    const blocks: ReportBlock[] = [];
    for (const l of t.lines) {
      const b = new RowBuilder();
      const size = formatNum(l.size);
      if (size !== null || l.sizeUnit) b.kv('Maat', `${size ?? 'niet ingevuld'}${l.sizeUnit ? ` ${l.sizeUnit}` : ''}`);
      b.num('Inbrengdiepte', l.depthCm, 'cm').kv('Locatie', l.location).para('Tippositie en controle', l.tipPosition);
      blocks.push({ card: true, title: LINE_TYPE_LABELS[l.type], rows: b.orEmpty() });
    }
    const tubes = [...t.tubes].sort((a, b) => compareInstants(sortedVersions(a)[0]?.validFrom ?? null, sortedVersions(b)[0]?.validFrom ?? null));
    tubes.forEach((tube, i) => {
      const b = new RowBuilder();
      for (const v of sortedVersions(tube)) {
        b.sub(`${v.kind === 'plaatsing' ? 'Plaatsing' : 'Aanpassing'} ${fi(v.validFrom) || '(tijdstip niet ingevuld)'}${v.correctedAt ? ` — historisch gecorrigeerd op ${fi(v.correctedAt)}` : ''}`);
        b.num('Tubemaat (binnendiameter)', v.sizeMm, 'mm')
          .kv('Route', optionLabel(TUBE_ROUTE_OPTIONS, v.route))
          .num(tubeDepthLabel(v.route).replace(' (cm)', ''), v.depthCm, 'cm')
          .para('Tippositie en controle', v.tipPosition);
      }
      if (tube.replacedAt) b.kv('Vervangen door nieuwe tube', fi(tube.replacedAt));
      blocks.push({ card: true, title: `Endotracheale tube ${tubes.length > 1 ? i + 1 : ''}`.trim(), rows: b.rows });
    });
    if (blocks.length === 0) blocks.push({ rows: [{ type: 'note', text: 'Geen lijnen, sondes, drains of tube geregistreerd.' }] });
    sections.push({ title: 'Plastic', blocks });
  }

  // Medicatie: tabel, één rij per toediening (chronologisch)
  {
    const { table } = medicationTable(t.medications, timeZone);
    sections.push({ title: 'Medicatie', blocks: [table.rows.length ? { rows: [], table } : { rows: [{ type: 'note', text: 'Geen medicatietoedieningen geregistreerd.' }] }] });
  }

  // Infusen: tabel, één rij per infuus met het verloop van de pompsnelheid
  {
    const { table } = infusionTable(t.infusions, timeZone);
    sections.push({ title: 'Infusen', blocks: [table.rows.length ? { rows: [], table } : { rows: [{ type: 'note', text: 'Geen infusen geregistreerd.' }] }] });
  }

  // Notities, Gezin
  sections.push({ title: 'Notities', blocks: [{ rows: new RowBuilder().para(undefined, t.proceduresAndEvents).orEmpty() }] });
  {
    const b = new RowBuilder().para(undefined, t.parentsAndFamily);
    b.kv('Telefoonnummer moeder', t.motherPhone.trim()).kv('Telefoonnummer partner', t.partnerPhone.trim());
    sections.push({ title: 'Gezin', blocks: [{ rows: b.orEmpty() }] });
  }

  // Checklist voor vertrek: bewust niet in het verslag (alleen in het formulier).

  // Transport
  {
    const c = t.closure;
    const b = new RowBuilder();
    b.kv('Vertrek met kind', fi(c.departedCotsideAt)).para('Gebeurtenissen tijdens transport', c.eventsDuringTransport).kv('Aankomst ontvangend centrum', fi(c.arrivedReceivingAt));
    sections.push({ title: 'Transport', blocks: [{ rows: b.orEmpty() }] });
  }

  const meta = [
    [t.child.name, t.child.patientNumber ? `Patiëntnummer ${t.child.patientNumber}` : ''].filter(Boolean).join(' · '),
    `Verwijzing: ${fi(t.referral.referredAt) || 'niet ingevuld'}${t.referral.referringHospital ? ` · ${t.referral.referringHospital}` : ''} → ${[t.referral.receivingHospital, t.referral.receivingDepartment].filter(Boolean).join(' ') || 'niet ingevuld'}`,
    `Tijden in tijdzone ${timeZone}. Verslag gegenereerd op ${formatInstant(new Date(generatedAt).toISOString(), timeZone)}.`,
    'Lege velden zijn weggelaten.',
  ].filter(Boolean);

  return { title: 'Transportverslag neonataal transport', meta, sections };
}

/** Tijdlijn als tabel: één rij per meetmoment (chronologisch), alleen kolommen met minstens één waarde. */
export function timelineReportTable(measurements: Measurement[], timeZone: string): { table: ReportTable; rows: Measurement[] } {
  const { rows, columns } = timelineTable(measurements, timeZone);
  return {
    rows,
    table: {
      columns: columns.map((c) => ({ header: c.label, fullLabel: c.fullLabel, unit: c.unit, keyColumn: !!c.key_column, group: TIMELINE_GROUP_LABELS[c.group] })),
      rows: rows.map((m, i) => columns.map((c) => c.cell(m, i))),
      alerts: rows.map((m) => columns.map((c) => c.alert?.(m) ?? false)),
      notes: rows.map((m) => (m.policyChanges ?? '').trim()),
      noteLabel: 'Beleidsaanpassingen',
    },
  };
}

export function tubeSummary(v: TubeVersion, timeZone: string): string {
  const parts = [
    formatNum(v.sizeMm, 'mm') ? `${formatNum(v.sizeMm, 'mm')} binnendiameter` : null,
    optionLabel(TUBE_ROUTE_OPTIONS, v.route).toLowerCase() || null,
    formatNum(v.depthCm, 'cm') ? `${tubeDepthLabel(v.route).replace(' (cm)', '').toLowerCase()} ${formatNum(v.depthCm, 'cm')}` : null,
  ].filter(Boolean);
  return `${parts.join(', ') || 'gegevens niet ingevuld'} (geldend vanaf ${formatInstant(v.validFrom, timeZone) || 'onbekend tijdstip'})`;
}

/** Tijdcel: "dd-mm-jjjj\nuu:mm" als de rijen over meer dan één dag gaan, anders alleen "uu:mm". */
function timeCells(instants: Instant[], timeZone: string): (i: Instant) => string {
  const days = new Set(instants.map((i) => formatInstant(i, timeZone).slice(0, 10)).filter(Boolean));
  return (i) => {
    const f = formatInstant(i, timeZone);
    if (!f) return '—';
    return days.size > 1 ? `${f.slice(0, 10)}\n${f.slice(11)}` : f.slice(11);
  };
}

const simpleColumn = (header: string, unit = '', keyColumn = false) => ({ header, fullLabel: header, unit, keyColumn, group: '' });

/** Medicatietoedieningen als tabel (chronologisch); `rows` in dezelfde volgorde als de tabelrijen. */
export function medicationTable(meds: MedicationAdministration[], timeZone: string): { table: ReportTable; rows: MedicationAdministration[] } {
  const rows = [...meds].sort((a, b) => compareInstants(a.at, b.at));
  const time = timeCells(
    rows.map((m) => m.at),
    timeZone,
  );
  return {
    rows,
    table: {
      simple: true,
      rowLabel: 'Toediening',
      columns: [simpleColumn('Tijd', '', true), simpleColumn('Medicament'), simpleColumn('Dosis'), simpleColumn('Toedieningsroute')],
      rows: rows.map((m) => {
        const dose = formatNum(m.dose);
        return [time(m.at), m.name, dose !== null || m.doseUnit ? `${dose ?? '?'}${m.doseUnit ? ` ${m.doseUnit}` : ''}` : '', m.route];
      }),
    },
  };
}

/** Infusen als tabel (op starttijd): pompsnelheid met verloop, en stoptijd of "loopt". */
export function infusionTable(infusions: Infusion[], timeZone: string): { table: ReportTable; rows: Infusion[] } {
  const rows = [...infusions].sort((a, b) => compareInstants(a.startAt, b.startAt));
  const all = rows.flatMap((i) => [i.startAt, i.stopAt, ...i.rates.map((r) => r.at)]);
  const time = timeCells(all, timeZone);
  const short = (i: Instant) => time(i).replace('\n', ' ');
  return {
    rows,
    table: {
      simple: true,
      rowLabel: 'Infuus',
      columns: [simpleColumn('Start', '', true), simpleColumn('Medicatie en concentratie'), simpleColumn('Pompsnelheid', 'mL/uur'), simpleColumn('Stop')],
      rows: rows.map((inf) => [
        time(inf.startAt),
        inf.name,
        sortedRates(inf)
          .map((r, i) => `${formatNum(r.rateMlPerHour) ?? '?'}${i === 0 ? '' : ` vanaf ${short(r.at)}`}`)
          .join('\n'),
        inf.stopAt ? short(inf.stopAt) : 'loopt',
      ]),
    },
  };
}
