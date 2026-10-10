import type { Transport } from './types';
import { newId, newTransport } from './factory';
import { DEFAULT_TIME_ZONE, wallToInstant } from './time';

/** Volledig fictief voorbeeldtransport (over middernacht) voor demonstratie en tests. */
export function sampleTransport(timeZone = DEFAULT_TIME_ZONE): Transport {
  const at = (wall: string) => wallToInstant(wall, timeZone);
  const t = newTransport(timeZone);
  const tubeId = newId();
  return {
    ...t,
    child: {
      name: 'Baby Voorbeeld (fictief)',
      patientNumber: '0012345',
      birthDate: '2026-10-07',
      birthTime: '14:32',
      gestationalAgeWeeks: 33,
      gestationalAgeDays: 5,
      birthWeightGram: 1980,
      currentWeightGram: 1890,
    },
    referral: {
      referredAt: at('2026-10-09T22:10'),
      referringHospital: 'Alrijne Ziekenhuis',
      referringDepartment: 'Kinderafdeling / neonatologie',
      referrerName: 'Dr. A. Fictief',
      referrerPhone: '071 000 0000',
      receivingHospital: '',
      receivingDepartment: '',
      reason: 'Toenemende zuurstofbehoefte en apneus ondanks CPAP. (Fictieve voorbeeldgegevens.)',
    },
    birth: {
      maternalHistory: 'G2P1, zwangerschap ongecompliceerd tot 33 weken. Spontane weeën. (Fictief.)',
      antenatalCorticosteroids: 'onvolledig',
      antenatalMagnesium: 'ja',
      resuscitation: 'Ondersteuning met maskerbeademing gedurende 1 minuut, daarna CPAP.',
      apgar1: 6,
      apgar5: 8,
      apgar10: 9,
      cordArterial: { ph: 7.21, be: -6.4, lactate: 4.1 },
      cordVenous: { ph: 7.28, be: -4.9, lactate: 3.2 },
      vitaminK: 'anders',
      vitaminKOther: 'Intramusculair toegediend',
    },
    referralCondition: {
      notes: {
        airway: 'Eigen luchtweg, CPAP via binasale prongs.',
        breathing: 'Intrekkingen, apneus met desaturaties.',
        circulation: 'Hartfrequentie stabiel, goede perifere circulatie.',
        disability: 'Reageert op prikkels.',
        fluids: 'Glucose 10% via perifeer infuus.',
        'gastrointestinal': 'Nog niet gevoed.',
        haematological: '',
        infection: 'Moeder koorts durante partu, antibiotica gestart.',
      },
      advice: 'CPAP ophogen, bloedgas herhalen.',
    },
    dispatch: { ambulanceCalledAt: at('2026-10-09T22:20'), departedWithAmbulanceAt: at('2026-10-09T22:35') },
    teamAssessment: {
      arrivedAt: at('2026-10-09T23:05'),
      notes: {
        airway: 'Geïntubeerd door transportteam, zie tube.',
        breathing: 'Na surfactant minder zuurstofbehoefte.',
        circulation: 'MAP adequaat, capillaire refill 2 s.',
        disability: '',
        fluids: '',
        gastrointestinal: 'Maagsonde in situ.',
        haematological: '',
        infection: 'Bloedkweek afgenomen.',
      },
      workingDiagnosis: 'Respiratoire insufficiëntie bij prematuriteit (fictief).',
      stabilisationPlan: 'Intubatie, surfactant, ventilatie op PTV, glucose-infuus continueren.',
      lastFeedAt: at('2026-10-09T18:00'),
    },
    measurements: [
      {
        id: newId(),
        at: at('2026-10-09T23:10'),
        phase: 'stabilisatie',
        resp: { mode: 'cpap', settingsByMode: { cpap: { peep: 7, fio2: 45, flow: null } } },
        monitor: { heartRate: 168, respRate: 72, spo2Pre: 89, spo2Post: 88, meanBp: 38, temperature: 36.6, capRefill: 2, tcCo2: null, etCo2: null },
        gas: { type: 'capillair', values: { ph: 7.19, pco2: 8.4, po2: 5.1, hco3: 21, be: -5.2, lactate: 2.8, glucose: 3.9, hb: null } },
      },
      {
        id: newId(),
        at: at('2026-10-09T23:45'),
        phase: 'stabilisatie',
        resp: { mode: 'ptv', settingsByMode: { ptv: { pip: 20, peep: 6, rate: 50, ti: 0.35, fio2: 35, vg: 4.5, map: null, ino: null } } },
        monitor: { heartRate: 155, respRate: null, spo2Pre: 94, spo2Post: 93, meanBp: 40, temperature: 36.8, capRefill: null, tcCo2: 6.1, etCo2: null },
        gas: { type: 'arterieel', values: { ph: 7.27, pco2: 6.3, po2: 7.9, hco3: 22, be: -3.1, lactate: 2.1, glucose: 4.6, hb: 10.2 } },
      },
      {
        id: newId(),
        at: at('2026-10-10T00:50'),
        phase: 'onderweg',
        resp: { mode: 'ptv', settingsByMode: { ptv: { pip: 18, peep: 6, rate: 50, ti: 0.35, fio2: 30, vg: 4.5, map: 9, ino: null } } },
        monitor: { heartRate: 150, respRate: null, spo2Pre: 95, spo2Post: null, meanBp: 41, temperature: 36.9, capRefill: null, tcCo2: 5.8, etCo2: null },
        gas: { type: '', values: { ph: null, pco2: null, po2: null, hco3: null, be: null, lactate: null, glucose: null, hb: null } },
      },
      {
        id: newId(),
        at: at('2026-10-10T01:20'),
        phase: 'onderweg',
        resp: { mode: 'hfov', settingsByMode: { hfov: { map: 14, amplitude: 28, frequencyHz: 10, fio2: 60, inspFraction: null, ino: null } } },
        monitor: { heartRate: 162, respRate: null, spo2Pre: 86, spo2Post: 84, meanBp: 36, temperature: 36.7, capRefill: null, tcCo2: null, etCo2: null },
        gas: { type: 'arterieel', values: { ph: 7.22, pco2: 7.4, po2: 3.8, hco3: 21, be: -5.5, lactate: 3.0, glucose: 4.8, hb: null } },
      },
    ],
    otherLabs: 'CRP 4 mg/L (fictief).',
    imaging: 'Thoraxfoto: beeld passend bij surfactantdeficiëntie; tubetip ter hoogte van Th2.',
    allergies: 'Geen bekende allergieën.',
    medications: [
      { id: newId(), at: at('2026-10-09T23:30'), name: 'Surfactant (fictief voorbeeld)', dose: 200, doseUnit: 'mg/kg', route: 'Endotracheaal' },
      { id: newId(), at: at('2026-10-09T23:22'), name: 'Voorbeeldmedicament', dose: 0.5, doseUnit: 'mg', route: 'Intraveneus' },
    ],
    infusions: [
      {
        id: newId(),
        startAt: at('2026-10-09T23:15'),
        name: 'Glucose 10%',
        rates: [
          { id: newId(), at: at('2026-10-09T23:15'), rateMlPerHour: 3.2 },
          { id: newId(), at: at('2026-10-10T00:15'), rateMlPerHour: 4 },
        ],
        stopAt: null,
      },
    ],
    lines: [
      { id: newId(), type: 'perifeer_infuus', size: 24, sizeUnit: 'G', depthCm: null, location: 'Linkerhand', tipPosition: '' },
      { id: newId(), type: 'maagsonde', size: 6, sizeUnit: 'Fr', depthCm: 17, location: 'Oraal', tipPosition: 'Aspiraat zuur getest.' },
    ],
    tubes: [
      {
        id: tubeId,
        replacedAt: null,
        versions: [
          { id: newId(), kind: 'plaatsing', validFrom: at('2026-10-09T23:20'), sizeMm: 3, route: 'oraal', depthCm: 8, tipPosition: 'Auscultatie symmetrisch.', correctedAt: null },
          { id: newId(), kind: 'aanpassing', validFrom: at('2026-10-10T00:10'), sizeMm: 3, route: 'oraal', depthCm: 7.5, tipPosition: 'Teruggetrokken na thoraxfoto (tip Th2).', correctedAt: null },
        ],
      },
    ],
    proceduresAndEvents: 'Intubatie bij tweede poging. Surfactant toegediend zonder complicaties.',
    parentsAndFamily: 'Ouders aanwezig, geïnformeerd over overplaatsing. Vader reist mee met eigen vervoer.',
    checklist: { fixatie: 'gedaan', gas: 'gedaan', tempGlucose: 'gedaan', beeldvorming: 'nog_niet', ouders: 'gedaan', voeding: 'nvt' },
    motherPhone: '06 0000 0001',
    partnerPhone: '06 0000 0002',
    closure: {
      departedCotsideAt: at('2026-10-10T00:40'),
      eventsDuringTransport: 'Rustig transport, geen bijzonderheden.',
      arrivedReceivingAt: at('2026-10-10T01:35'),
    },
  };
}
