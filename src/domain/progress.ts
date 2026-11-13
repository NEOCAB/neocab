import type { Transport } from './types';

/**
 * Of er in een sectie al iets is ingevuld (voor het stipje in het sectiemenu). Standaardwaarden zoals de verwijstijd
 * (nu) of "nog niet gedaan" in de checklist tellen niet mee.
 */
const text = (...v: (string | null | undefined)[]) => v.some((x) => typeof x === 'string' && x.trim() !== '');
const num = (...v: unknown[]) => v.some((x) => x !== null && x !== undefined && x !== '');

export function sectionFilled(t: Transport, id: string): boolean {
  const c = t.child;
  const r = t.referral;
  const b = t.birth;
  const rc = t.referralCondition;
  const a = t.teamAssessment;
  switch (id) {
    case 's1':
      return text(c.name, c.patientNumber, c.birthDate, c.birthTime) || num(c.gestationalAgeWeeks, c.birthWeightGram, c.currentWeightGram);
    case 's2':
      return text(r.referringHospital, r.referringDepartment, r.referrerName, r.referrerPhone, r.receivingHospital, r.receivingDepartment, r.reason) || r.therapeuticHypothermia;
    case 's3':
      return (
        text(b.maternalHistory, b.antenatalCorticosteroids, b.antenatalMagnesium, b.resuscitation, b.vitaminK, rc.advice, ...Object.values(rc.notes)) ||
        num(b.apgar1, b.apgar5, b.apgar10, b.cordArterial.ph, b.cordArterial.be, b.cordArterial.lactate, b.cordVenous.ph, b.cordVenous.be, b.cordVenous.lactate)
      );
    case 'sdispatch':
      return text(t.dispatch.ambulanceCalledAt, t.dispatch.departedWithAmbulanceAt, a.arrivedAt);
    case 's5':
      return text(a.workingDiagnosis, a.stabilisationPlan, a.lastFeedAt, ...Object.values(a.notes));
    case 's6':
      return t.measurements.length > 0;
    case 's7':
      return text(t.otherLabs, t.imaging);
    case 's10':
      return t.lines.length > 0 || t.tubes.length > 0;
    case 's8':
      return t.medications.length > 0;
    case 's9':
      return t.infusions.length > 0;
    case 's11':
      return text(t.proceduresAndEvents);
    case 's12':
      return text(t.parentsAndFamily, t.motherPhone, t.partnerPhone);
    case 's13':
      return Object.values(t.checklist).some((s) => s !== 'nog_niet');
    case 's14':
      return text(t.closure.departedCotsideAt, t.closure.eventsDuringTransport, t.closure.arrivedReceivingAt);
    default:
      return false;
  }
}
