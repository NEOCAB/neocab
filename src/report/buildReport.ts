import type { AbcdNotes, BloodGasCord, Measurement, Num, Transport, TubeVersion } from '../domain/types';
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

  // 1 Basisgegevens kind
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

  // 2 Herkomst en bestemming
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
      .para('Reden van overplaatsing', r.reason);
    sections.push({ title: 'Herkomst en bestemming', blocks: [{ rows: b.orEmpty() }] });
  }

  // 3 Verwijzing: zwangerschap en geboorte, toestand bij verwijzing
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
        ...(advice.rows.length ? [{ title: 'Advies', rows: advice.rows }] : []),
      ],
    });
  }

  // 5 Dispatch
  {
    const b = new RowBuilder();
    b.kv('Ambulance aangevraagd', fi(t.dispatch.ambulanceCalledAt)).kv('Vertrek transportteam', fi(t.dispatch.departedWithAmbulanceAt)).kv('Aankomst bij kind', fi(t.teamAssessment.arrivedAt));
    sections.push({ title: 'Dispatch', blocks: [{ rows: b.orEmpty() }] });
  }

  // 6 Stabilisatie (aankomst bij kind staat bij 5 Dispatch)
  {
    const a = t.teamAssessment;
    const b = new RowBuilder();
    b.rows.push(...abcdRows(a.notes));
    b.para('Werkdiagnose', a.workingDiagnosis).para('Stabilisatieplan', a.stabilisationPlan).kv('Laatste voeding', fi(a.lastFeedAt));
    sections.push({ title: 'Stabilisatie', blocks: [{ rows: b.orEmpty() }] });
  }

  // 6 Tijdlijn: één tabel, elke rij is één meetmoment
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

  // 7 Overige diagnostiek
  {
    const b = new RowBuilder();
    b.para('Overige laboratoriumuitslagen', t.otherLabs).para('Beeldvorming en overige onderzoeken', t.imaging);
    sections.push({ title: 'Overige diagnostiek', blocks: [{ rows: b.orEmpty() }] });
  }

  // 8 Medicatie
  {
    const blocks: ReportBlock[] = [];
    const meds = [...t.medications].sort((a, b) => compareInstants(a.at, b.at));
    for (const m of meds) {
      const b = new RowBuilder();
      b.kv('Datum en tijd', fi(m.at)).kv('Medicament', m.name);
      const dose = formatNum(m.dose);
      if (dose !== null || m.doseUnit) b.kv('Dosis', `${dose ?? 'niet ingevuld'}${m.doseUnit ? ` ${m.doseUnit}` : ''}`);
      b.kv('Toedieningsroute', m.route);
      blocks.push({ card: true, title: `${fi(m.at) || 'Tijdstip niet ingevuld'} · ${m.name || 'Medicament niet ingevuld'}`, rows: b.orEmpty() });
    }
    if (meds.length === 0) blocks.push({ rows: [{ type: 'note', text: 'Geen medicatietoedieningen geregistreerd.' }] });
    sections.push({ title: 'Medicatietoedieningen', blocks });
  }

  // 9 Infusen
  {
    const blocks: ReportBlock[] = [];
    const infs = [...t.infusions].sort((a, b) => compareInstants(a.startAt, b.startAt));
    for (const inf of infs) {
      const b = new RowBuilder();
      b.kv('Start', fi(inf.startAt)).kv('Medicatie en concentratie', inf.name);
      sortedRates(inf).forEach((r, i) => {
        b.kv(i === 0 ? 'Pompsnelheid bij start' : 'Snelheidswijziging', `${fi(r.at) || 'tijdstip niet ingevuld'}: ${formatNum(r.rateMlPerHour, 'mL/uur') ?? 'niet ingevuld'}`);
      });
      b.kv('Stop', inf.stopAt ? fi(inf.stopAt) : 'Loopt nog (geen stoptijd)');
      blocks.push({ card: true, title: `${inf.name || 'Infuus'}${inf.stopAt ? ' (gestopt)' : ' (lopend)'}`, rows: b.rows });
    }
    if (infs.length === 0) blocks.push({ rows: [{ type: 'note', text: 'Geen infusen geregistreerd.' }] });
    sections.push({ title: 'Lopende infusen', blocks });
  }

  // 10 Lijnen, sondes, drains en endotracheale tube
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
    sections.push({ title: 'Lijnen, sondes, drains en endotracheale tube', blocks });
  }

  // 11, 12
  sections.push({ title: 'Procedures en gebeurtenissen', blocks: [{ rows: new RowBuilder().para(undefined, t.proceduresAndEvents).orEmpty() }] });
  {
    const b = new RowBuilder().para(undefined, t.parentsAndFamily);
    b.kv('Telefoonnummer moeder', t.motherPhone.trim()).kv('Telefoonnummer partner', t.partnerPhone.trim());
    sections.push({ title: 'Ouders en gezin', blocks: [{ rows: b.orEmpty() }] });
  }

  // 14 Checklist voor vertrek: bewust niet in het verslag (alleen in het formulier).

  // 14 Afsluiting
  {
    const c = t.closure;
    const b = new RowBuilder();
    b.kv('Vertrek met kind', fi(c.departedCotsideAt)).para('Gebeurtenissen tijdens transport', c.eventsDuringTransport).kv('Aankomst ontvangend centrum', fi(c.arrivedReceivingAt));
    sections.push({ title: 'Afsluiting transport', blocks: [{ rows: b.orEmpty() }] });
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
