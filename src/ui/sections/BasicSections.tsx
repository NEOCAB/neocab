import type { AbcdNotes, BloodGasCord, ChecklistStatus, Transport } from '../../domain/types';
import { ABCD_KEYS, CHECKLIST_KEYS } from '../../domain/types';
import {
  ABCD_LABELS,
  CHECKLIST_LABELS,
  CORTICO_OPTIONS,
  HOSPITAL_SUGGESTIONS,
  VITAMIN_K_OPTIONS,
  YES_NO_UNKNOWN_OPTIONS,
} from '../../domain/labels';
import { ageInHoursIfYoung, correctedAge, transportDate } from '../../domain/calc';
import { useEffect, useState } from 'react';
import { DateField, DateTimeField, GestationField, NumberField, Section, Segmented, TextArea, TextField, TimeField, TimepointField } from '../fields';
import { useTimeZone } from '../context';

export type Update = (fn: (t: Transport) => Transport) => void;
export interface SectionProps {
  t: Transport;
  update: Update;
}

export function ChildSection({ t, update }: SectionProps) {
  const tz = useTimeZone();
  const c = t.child;
  const set = <K extends keyof Transport['child']>(k: K, v: Transport['child'][K]) => update((x) => ({ ...x, child: { ...x.child, [k]: v } }));
  const td = transportDate(t, tz);
  const ca = correctedAge(c, td);
  const now = useNow();
  const young = ageInHoursIfYoung(c, now, tz);
  return (
    <Section id="s1" title="Basisgegevens kind">
      {/* Acht velden: 2 kolommen × 4 rijen (smal) of 4 kolommen × 2 rijen (breed). */}
      <div className="grid basis-grid">
        <TextField label="Naam kind" value={c.name} onChange={(v) => set('name', v)} />
        <TextField label="Patiëntnummer" value={c.patientNumber} onChange={(v) => set('patientNumber', v)} inputMode="numeric" />
        <DateField label="Geboortedatum" value={c.birthDate} onChange={(v) => set('birthDate', v)} />
        <TimeField label="Geboortetijd" value={c.birthTime} onChange={(v) => set('birthTime', v)} />
        <GestationField
          label="Amenorroeduur"
          weeks={c.gestationalAgeWeeks}
          days={c.gestationalAgeDays}
          onChange={(w, d) => update((x) => ({ ...x, child: { ...x.child, gestationalAgeWeeks: w, gestationalAgeDays: d } }))}
        />
        <div className="field">
          <span className="field-label" id="corrected-age-label">
            Gecorrigeerde leeftijd
          </span>
          <output className="computed computed-value" aria-labelledby="corrected-age-label" aria-live="polite">
            {ca ? (
              <>
                <span className="computed-hours">{`${ca.weeks}+${ca.days} wk · dag ${ca.postnatalDay}`}</span>
                {young && (
                  <>
                    {' '}
                    <span className="computed-hours">{`· ${young.hours} u ${young.minutes} min`}</span>
                  </>
                )}
              </>
            ) : (
              '—'
            )}
          </output>
        </div>
        <NumberField label="Geboortegewicht" value={c.birthWeightGram} onChange={(v) => set('birthWeightGram', v)} unit="g" rules={{ min: 0 }} />
        <NumberField label="Huidig gewicht" value={c.currentWeightGram} onChange={(v) => set('currentWeightGram', v)} unit="g" rules={{ min: 0 }} />
      </div>
    </Section>
  );
}

/** Huidige tijd, elke 30 seconden bijgewerkt (voor de leeftijd in uren en minuten). */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const h = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(h);
  }, []);
  return now;
}

export function ReferralSection({ t, update }: SectionProps) {
  const r = t.referral;
  const set = <K extends keyof Transport['referral']>(k: K, v: Transport['referral'][K]) => update((x) => ({ ...x, referral: { ...x.referral, [k]: v } }));
  return (
    <Section id="s2" title="Herkomst en bestemming">
      <TimepointField label="Verwijzing" value={r.referredAt} onChange={(v) => set('referredAt', v)} />
      <div className="grid">
        <TextField label="Verwijzend ziekenhuis" value={r.referringHospital} onChange={(v) => set('referringHospital', v)} list={HOSPITAL_SUGGESTIONS} />
        <TextField label="Verwijzende afdeling" value={r.referringDepartment} onChange={(v) => set('referringDepartment', v)} />
        <TextField label="Naam verwijzer" value={r.referrerName} onChange={(v) => set('referrerName', v)} />
        <TextField label="Telefoonnummer verwijzer" type="tel" value={r.referrerPhone} onChange={(v) => set('referrerPhone', v)} />
      </div>
      <div className="grid">
        <TextField label="Ontvangende afdeling" value={r.receivingDepartment} onChange={(v) => set('receivingDepartment', v)} />
        <TextField label="Ontvangend ziekenhuis" value={r.receivingHospital} onChange={(v) => set('receivingHospital', v)} list={HOSPITAL_SUGGESTIONS} />
      </div>
      <TextArea label="Reden van overplaatsing" value={r.reason} onChange={(v) => set('reason', v)} />
    </Section>
  );
}

function CordGas({ legend, value, onChange }: { legend: string; value: BloodGasCord; onChange: (v: BloodGasCord) => void }) {
  return (
    <fieldset className="group">
      <legend>{legend}</legend>
      <div className="grid three">
        <NumberField label="pH" value={value.ph} onChange={(v) => onChange({ ...value, ph: v })} rules={{ min: 0 }} />
        <NumberField label="BE" value={value.be} onChange={(v) => onChange({ ...value, be: v })} unit="mmol/L" />
        <NumberField label="Lactaat" value={value.lactate} onChange={(v) => onChange({ ...value, lactate: v })} unit="mmol/L" rules={{ min: 0 }} />
      </div>
    </fieldset>
  );
}

function BirthFields({ t, update }: SectionProps) {
  const b = t.birth;
  const set = <K extends keyof Transport['birth']>(k: K, v: Transport['birth'][K]) => update((x) => ({ ...x, birth: { ...x.birth, [k]: v } }));
  const apgar = { min: 0, max: 10, integer: true };
  return (
    <>
      <h3 className="subsection-title">Zwangerschap en geboorte</h3>
      <TextArea label="Maternale en antenatale voorgeschiedenis" value={b.maternalHistory} onChange={(v) => set('maternalHistory', v)} />
      <Segmented legend="Antenatale corticosteroïden" value={b.antenatalCorticosteroids} onChange={(v) => set('antenatalCorticosteroids', v)} options={CORTICO_OPTIONS} />
      <Segmented legend="Antenataal magnesiumsulfaat" value={b.antenatalMagnesium} onChange={(v) => set('antenatalMagnesium', v)} options={YES_NO_UNKNOWN_OPTIONS} />
      <TextArea label="Reanimatie bij geboorte" value={b.resuscitation} onChange={(v) => set('resuscitation', v)} />
      <fieldset className="group">
        <legend>Apgarscores</legend>
        <div className="grid three">
          <NumberField label="1 minuut" value={b.apgar1} onChange={(v) => set('apgar1', v)} rules={apgar} />
          <NumberField label="5 minuten" value={b.apgar5} onChange={(v) => set('apgar5', v)} rules={apgar} />
          <NumberField label="10 minuten" value={b.apgar10} onChange={(v) => set('apgar10', v)} rules={apgar} />
        </div>
      </fieldset>
      <CordGas legend="Arterieel navelstrengbloedgas" value={b.cordArterial} onChange={(v) => set('cordArterial', v)} />
      <CordGas legend="Veneus navelstrengbloedgas" value={b.cordVenous} onChange={(v) => set('cordVenous', v)} />
      <Segmented legend="Vitamine K" value={b.vitaminK} onChange={(v) => set('vitaminK', v)} options={VITAMIN_K_OPTIONS} />
      {b.vitaminK === 'anders' && <TextField label="Vitamine K: anders, namelijk" value={b.vitaminKOther} onChange={(v) => set('vitaminKOther', v)} />}
    </>
  );
}

function AbcdFields({ notes, onChange }: { notes: AbcdNotes; onChange: (n: AbcdNotes) => void }) {
  return (
    <div className="abcd">
      {ABCD_KEYS.map((k) => (
        <TextArea key={k} label={ABCD_LABELS[k]} value={notes[k]} onChange={(v) => onChange({ ...notes, [k]: v })} rows={2} />
      ))}
    </div>
  );
}

/** Verwijzing: zwangerschap en geboorte, en de toestand bij verwijzing, in één sectie. */
export function ReferralInfoSection(props: SectionProps) {
  const { t, update } = props;
  const rc = t.referralCondition;
  return (
    <Section id="s3" title="Verwijzing">
      <BirthFields {...props} />
      <h3 className="subsection-title">Toestand bij verwijzing</h3>
      <AbcdFields notes={rc.notes} onChange={(n) => update((x) => ({ ...x, referralCondition: { ...x.referralCondition, notes: n } }))} />
      <TextArea label="Advies bij verwijzing (optioneel)" value={rc.advice} onChange={(v) => update((x) => ({ ...x, referralCondition: { ...x.referralCondition, advice: v } }))} />
    </Section>
  );
}

export function DispatchSection({ t, update }: SectionProps) {
  const d = t.dispatch;
  const set = <K extends keyof Transport['dispatch']>(k: K, v: Transport['dispatch'][K]) => update((x) => ({ ...x, dispatch: { ...x.dispatch, [k]: v } }));
  return (
    <Section id="sdispatch" title="Dispatch">
      <TimepointField label="Ambulance aangevraagd" value={d.ambulanceCalledAt} onChange={(v) => set('ambulanceCalledAt', v)} />
      <TimepointField label="Vertrek transportteam" value={d.departedWithAmbulanceAt} onChange={(v) => set('departedWithAmbulanceAt', v)} />
      <TimepointField
        label="Aankomst bij kind"
        value={t.teamAssessment.arrivedAt}
        onChange={(v) => update((x) => ({ ...x, teamAssessment: { ...x.teamAssessment, arrivedAt: v } }))}
      />
    </Section>
  );
}

export function TeamAssessmentSection({ t, update }: SectionProps) {
  const a = t.teamAssessment;
  const set = <K extends keyof Transport['teamAssessment']>(k: K, v: Transport['teamAssessment'][K]) => update((x) => ({ ...x, teamAssessment: { ...x.teamAssessment, [k]: v } }));
  return (
    <Section id="s5" title="Stabilisatie" intro="Eigen bevindingen van het transportteam; de toestand bij verwijzing blijft ongewijzigd bewaard.">
      <AbcdFields notes={a.notes} onChange={(n) => set('notes', n)} />
      <TextArea label="Werkdiagnose" value={a.workingDiagnosis} onChange={(v) => set('workingDiagnosis', v)} />
      <TextArea label="Stabilisatieplan" value={a.stabilisationPlan} onChange={(v) => set('stabilisationPlan', v)} />
      <DateTimeField label="Laatste voeding" value={a.lastFeedAt} onChange={(v) => set('lastFeedAt', v)} />
    </Section>
  );
}

export function OtherDiagnosticsSection({ t, update }: SectionProps) {
  return (
    <Section id="s7" title="Overige diagnostiek">
      <TextArea label="Overige laboratoriumuitslagen" value={t.otherLabs} onChange={(v) => update((x) => ({ ...x, otherLabs: v }))} />
      <TextArea label="Beeldvorming en overige onderzoeken" value={t.imaging} onChange={(v) => update((x) => ({ ...x, imaging: v }))} />
    </Section>
  );
}

export function ProceduresSection({ t, update }: SectionProps) {
  return (
    <Section id="s11" title="Procedures en gebeurtenissen">
      <TextArea label="Procedures en gebeurtenissen" value={t.proceduresAndEvents} onChange={(v) => update((x) => ({ ...x, proceduresAndEvents: v }))} rows={5} />
    </Section>
  );
}

export function ParentsSection({ t, update }: SectionProps) {
  return (
    <Section id="s12" title="Ouders en gezin">
      <TextArea label="Ouders en gezin" value={t.parentsAndFamily} onChange={(v) => update((x) => ({ ...x, parentsAndFamily: v }))} rows={4} />
      <div className="grid two phones">
        <TextField label="Telefoonnummer moeder" type="tel" value={t.motherPhone} onChange={(v) => update((x) => ({ ...x, motherPhone: v }))} />
        <TextField label="Telefoonnummer partner" type="tel" value={t.partnerPhone} onChange={(v) => update((x) => ({ ...x, partnerPhone: v }))} />
      </div>
    </Section>
  );
}

const NEXT_STATUS: Record<ChecklistStatus, ChecklistStatus> = { nog_niet: 'gedaan', gedaan: 'nvt', nvt: 'nog_niet' };
const STATUS_TEXT: Record<ChecklistStatus, string> = { nog_niet: 'nog niet gedaan', gedaan: 'gedaan', nvt: 'niet van toepassing' };

export function ChecklistSection({ t, update }: SectionProps) {
  return (
    <Section id="s13" title="Checklist voor vertrek">
      <ul className="checklist">
        {CHECKLIST_KEYS.map((k) => {
          const status = t.checklist[k];
          return (
            <li key={k}>
              <button
                type="button"
                className={`check-row ${status}`}
                aria-label={`${CHECKLIST_LABELS[k]}: ${STATUS_TEXT[status]}. Tik om te wijzigen.`}
                onClick={() => update((x) => ({ ...x, checklist: { ...x.checklist, [k]: NEXT_STATUS[x.checklist[k]] } }))}
              >
                <span className={`check-box ${status}`} aria-hidden="true">
                  {status === 'gedaan' ? '✓' : status === 'nvt' ? '✕' : ''}
                </span>
                <span className="check-text">{CHECKLIST_LABELS[k]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function ClosureSection({ t, update }: SectionProps) {
  const c = t.closure;
  const set = <K extends keyof Transport['closure']>(k: K, v: Transport['closure'][K]) => update((x) => ({ ...x, closure: { ...x.closure, [k]: v } }));
  return (
    <Section id="s14" title="Afsluiting transport">
      <TimepointField label="Vertrek met kind" value={c.departedCotsideAt} onChange={(v) => set('departedCotsideAt', v)} />
      <TextArea label="Gebeurtenissen tijdens transport" value={c.eventsDuringTransport} onChange={(v) => set('eventsDuringTransport', v)} rows={4} />
      <TimepointField label="Aankomst ontvangend centrum" value={c.arrivedReceivingAt} onChange={(v) => set('arrivedReceivingAt', v)} />
    </Section>
  );
}
