import type { AbcdNotes, BloodGasCord, Num, Transport, TubeVersion } from '../domain/types';
import { ABCD_KEYS, CHECKLIST_KEYS } from '../domain/types';
import {
  ABCD_LABELS,
  CHECKLIST_LABELS,
  CHECKLIST_STATUS_OPTIONS,
  CORTICO_OPTIONS,
  GAS_FIELDS,
  GAS_TYPE_OPTIONS,
  LINE_TYPE_LABELS,
  MONITOR_FIELDS,
  PHASE_OPTIONS,
  RESP_MODE_LABELS,
  SEX_OPTIONS,
  TUBE_ROUTE_OPTIONS,
  VITAMIN_K_OPTIONS,
  YES_NO_UNKNOWN_OPTIONS,
  isInvasive,
  optionLabel,
  respFieldsFor,
  tubeDepthLabel,
} from '../domain/labels';
import { formatNum } from '../domain/num';
import { compareInstants, DEFAULT_TIME_ZONE, formatInstant, formatLocalDate } from '../domain/time';
import { doseWeight, formatGestation, postmenstrualAge, transportDate } from '../domain/calc';
import { sortedMeasurements, sortedRates, sortedVersions, tubeAt } from '../domain/timeline';

export type ReportRow =
  | { type: 'kv'; label: string; value: string }
  | { type: 'para'; label?: string; text: string }
  | { type: 'sub'; text: string }
  | { type: 'note'; text: string };

export interface ReportBlock {
  title?: string;
  /** Kaart-blok (meetmoment, infuus, ...): bij voorkeur niet over een pagina verdelen. */
  card?: boolean;
  rows: ReportRow[];
}

export interface ReportSection {
  title: string;
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
      .kv('LUMC-patiëntnummer', c.patientNumber)
      .kv('Geslacht', optionLabel(SEX_OPTIONS, c.sex))
      .kv('Geboortedatum', formatLocalDate(c.birthDate))
      .kv('Geboortetijd', c.birthTime)
      .kv('Zwangerschapsduur bij geboorte', formatGestation(c.gestationalAgeWeeks, c.gestationalAgeDays));
    const td = transportDate(t, timeZone);
    const pma = postmenstrualAge(c, td);
    if (pma) {
      b.kv('Postmenstruele leeftijd', `${pma.weeks}+${pma.days} weken (berekend op transportdatum ${formatLocalDate(td)})`);
      b.kv('Postnatale leeftijd', `${pma.postnatalDays} ${pma.postnatalDays === 1 ? 'dag' : 'dagen'} (kalenderdagen tot transportdatum)`);
    }
    b.num('Geboortegewicht', c.birthWeightGram, 'g');
    const cw = formatNum(c.currentWeightGram, 'g');
    if (cw || c.currentWeightDate) b.kv('Huidig gewicht', `${cw ?? 'niet ingevuld'}${c.currentWeightDate ? ` (gewogen ${formatLocalDate(c.currentWeightDate)})` : ''}`);
    const dw = doseWeight(c);
    const dwText = formatNum(dw.value, 'g');
    if (dwText) b.kv('Doseergewicht', dw.manual ? `${dwText} (handmatig ingesteld${dw.auto !== null ? `; automatisch berekend: ${formatNum(dw.auto, 'g')}` : ''})` : `${dwText} (automatisch: hoogste bekende gewicht)`);
    sections.push({ title: '1 Basisgegevens kind', blocks: [{ rows: b.orEmpty() }] });
  }

  // 2 Verwijzing en bestemming
  {
    const r = t.referral;
    const b = new RowBuilder();
    b.kv('Datum en tijd verwijzing', fi(r.referredAt))
      .kv('Verwijzend ziekenhuis', r.referringHospital)
      .kv('Verwijzende afdeling', r.referringDepartment)
      .kv('Naam verwijzer', r.referrerName)
      .kv('Telefoonnummer verwijzer', r.referrerPhone)
      .kv('Ontvangend ziekenhuis', r.receivingHospital)
      .kv('Ontvangende afdeling', r.receivingDepartment)
      .para('Reden van overplaatsing', r.reason);
    sections.push({ title: '2 Verwijzing en bestemming', blocks: [{ rows: b.orEmpty() }] });
  }

  // 3 Zwangerschap en geboorte
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
    sections.push({ title: '3 Zwangerschap en geboorte', blocks: [{ rows: b.orEmpty() }] });
  }

  // 4 Toestand bij verwijzing
  {
    const rows = abcdRows(t.referralCondition.notes);
    const b = new RowBuilder();
    b.para('Advies bij verwijzing', t.referralCondition.advice);
    const all = [...rows, ...b.rows];
    sections.push({ title: '4 Toestand bij verwijzing', blocks: [{ rows: all.length ? all : [NOT_FILLED] }] });
  }

  // 5 Onderzoek door transportteam
  {
    const a = t.teamAssessment;
    const b = new RowBuilder();
    b.kv('Aankomst bij verwijzend ziekenhuis', fi(a.arrivedAt));
    b.rows.push(...abcdRows(a.notes));
    b.para('Werkdiagnose', a.workingDiagnosis).para('Stabilisatieplan', a.stabilisationPlan).kv('Laatste voeding', fi(a.lastFeedAt));
    sections.push({ title: '5 Onderzoek door transportteam', blocks: [{ rows: b.orEmpty() }] });
  }

  // 6 Tijdlijn
  {
    const blocks: ReportBlock[] = [];
    sortedMeasurements(t.measurements).forEach((m, idx) => {
      const b = new RowBuilder();
      const mode = m.resp.mode;
      if (mode) {
        b.sub('Ademhalingsondersteuning');
        const kind = mode === 'geen' ? '' : isInvasive(mode) ? ' (invasief)' : ' (non-invasief)';
        b.kv('Modaliteit', `${RESP_MODE_LABELS[mode]}${kind}`);
        const settings = m.resp.settingsByMode[mode] ?? {};
        for (const fdef of respFieldsFor(mode)) b.num(fdef.label.replace(/ \(optioneel\)$/, ''), settings[fdef.key] ?? null, fdef.unit);
        if (isInvasive(mode)) {
          const tube = tubeAt(t.tubes, m.at);
          b.kv('Endotracheale tube', tube ? tubeSummary(tube.version, timeZone) : 'geen tubegegevens geregistreerd voor dit tijdstip');
        }
      }
      const monitor = new RowBuilder();
      for (const fdef of MONITOR_FIELDS) monitor.num(fdef.label, m.monitor[fdef.key], fdef.unit);
      if (monitor.rows.length) {
        b.sub('Monitorgegevens');
        b.rows.push(...monitor.rows);
      }
      const gas = new RowBuilder();
      for (const fdef of GAS_FIELDS) gas.num(fdef.label, m.gas.values[fdef.key], fdef.unit);
      if (gas.rows.length || m.gas.type) {
        b.sub('Bloedgas');
        b.kv('Afnametijd', fi(m.gas.sampledAt)).kv('Afnametype', optionLabel(GAS_TYPE_OPTIONS, m.gas.type));
        b.rows.push(...gas.rows);
      }
      const phase = optionLabel(PHASE_OPTIONS, m.phase);
      blocks.push({
        card: true,
        title: `Meetmoment ${idx + 1} · ${fi(m.at) || 'tijdstip niet ingevuld'}${phase ? ` · ${phase}` : ''}`,
        rows: b.orEmpty(),
      });
    });
    sections.push({ title: '6 Tijdlijn: ademhalingsondersteuning, monitorgegevens en bloedgassen', blocks: blocks.length ? blocks : [{ rows: [{ type: 'note', text: 'Geen meetmomenten geregistreerd.' }] }] });
  }

  // 7 Overige diagnostiek
  {
    const b = new RowBuilder();
    b.para('Overige laboratoriumuitslagen', t.otherLabs).para('Beeldvorming en overige onderzoeken', t.imaging);
    sections.push({ title: '7 Overige diagnostiek', blocks: [{ rows: b.orEmpty() }] });
  }

  // 8 Medicatie
  {
    const blocks: ReportBlock[] = [];
    const head = new RowBuilder();
    head.para('Allergieën', t.allergies);
    if (head.rows.length) blocks.push({ rows: head.rows });
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
    sections.push({ title: '8 Medicatietoedieningen', blocks });
  }

  // 9 Infusen
  {
    const blocks: ReportBlock[] = [];
    const infs = [...t.infusions].sort((a, b) => compareInstants(a.startAt, b.startAt));
    for (const inf of infs) {
      const b = new RowBuilder();
      b.kv('Start', fi(inf.startAt)).kv('Vloeistof of medicament', inf.name);
      sortedRates(inf).forEach((r, i) => {
        b.kv(i === 0 ? 'Pompsnelheid bij start' : 'Snelheidswijziging', `${fi(r.at) || 'tijdstip niet ingevuld'}: ${formatNum(r.rateMlPerHour, 'mL/uur') ?? 'niet ingevuld'}`);
      });
      b.kv('Stop', inf.stopAt ? fi(inf.stopAt) : 'Loopt nog (geen stoptijd)');
      blocks.push({ card: true, title: `${inf.name || 'Infuus'}${inf.stopAt ? ' (gestopt)' : ' (lopend)'}`, rows: b.rows });
    }
    if (infs.length === 0) blocks.push({ rows: [{ type: 'note', text: 'Geen infusen geregistreerd.' }] });
    sections.push({ title: '9 Lopende infusen', blocks });
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
    sections.push({ title: '10 Lijnen, sondes, drains en endotracheale tube', blocks });
  }

  // 11, 12
  sections.push({ title: '11 Procedures en gebeurtenissen', blocks: [{ rows: new RowBuilder().para(undefined, t.proceduresAndEvents).orEmpty() }] });
  sections.push({ title: '12 Ouders en gezin', blocks: [{ rows: new RowBuilder().para(undefined, t.parentsAndFamily).orEmpty() }] });

  // 13 Checklist
  {
    const b = new RowBuilder();
    CHECKLIST_KEYS.forEach((k, i) => {
      b.kv(`${i + 1}. ${CHECKLIST_LABELS[k]}`, CHECKLIST_STATUS_OPTIONS.find((o) => o.value === t.checklist[k])?.label ?? 'Nog niet gedaan');
    });
    const phones = t.parentPhones.map((p) => p.trim()).filter(Boolean);
    b.kv('Telefoonnummers ouders', phones.length ? phones.join('\n') : 'Niet ingevuld');
    sections.push({ title: '13 Checklist voor vertrek', blocks: [{ rows: b.rows }] });
  }

  // 14 Afsluiting
  {
    const c = t.closure;
    const b = new RowBuilder();
    b.kv('Vertrek van cotside', fi(c.departedCotsideAt)).para('Gebeurtenissen tijdens transport', c.eventsDuringTransport).kv('Aankomst ontvangend centrum', fi(c.arrivedReceivingAt));
    sections.push({ title: '14 Afsluiting transport', blocks: [{ rows: b.orEmpty() }] });
  }

  const meta = [
    [t.child.name, t.child.patientNumber ? `LUMC-patiëntnummer ${t.child.patientNumber}` : ''].filter(Boolean).join(' · '),
    `Verwijzing: ${fi(t.referral.referredAt) || 'niet ingevuld'}${t.referral.referringHospital ? ` · ${t.referral.referringHospital}` : ''} → ${[t.referral.receivingHospital, t.referral.receivingDepartment].filter(Boolean).join(' ') || 'niet ingevuld'}`,
    `Tijden in tijdzone ${timeZone}. Verslag gegenereerd op ${formatInstant(new Date(generatedAt).toISOString(), timeZone)}.`,
    'Lege velden zijn weggelaten; "onbekend" betekent expliciet als onbekend geregistreerd.',
  ].filter(Boolean);

  return { title: 'Transportverslag neonataal transport', meta, sections };
}

export function tubeSummary(v: TubeVersion, timeZone: string): string {
  const parts = [
    formatNum(v.sizeMm, 'mm') ? `${formatNum(v.sizeMm, 'mm')} binnendiameter` : null,
    optionLabel(TUBE_ROUTE_OPTIONS, v.route).toLowerCase() || null,
    formatNum(v.depthCm, 'cm') ? `${tubeDepthLabel(v.route).replace(' (cm)', '').toLowerCase()} ${formatNum(v.depthCm, 'cm')}` : null,
  ].filter(Boolean);
  return `${parts.join(', ') || 'gegevens niet ingevuld'} (geldend vanaf ${formatInstant(v.validFrom, timeZone) || 'onbekend tijdstip'})`;
}
