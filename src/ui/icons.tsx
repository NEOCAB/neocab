import idCard from '@material-symbols/svg-700/outlined/id_card.svg?raw';
import route from '@material-symbols/svg-700/outlined/route.svg?raw';
import pregnantWoman from '@material-symbols/svg-700/outlined/pregnant_woman.svg?raw';
import sick from '@material-symbols/svg-700/outlined/sick.svg?raw';
import ambulance from '@material-symbols/svg-700/outlined/ambulance.svg?raw';
import clinicalNotes from '@material-symbols/svg-700/outlined/clinical_notes.svg?raw';
import timeline from '@material-symbols/svg-700/outlined/timeline.svg?raw';
import labResearch from '@material-symbols/svg-700/outlined/lab_research.svg?raw';
import medication from '@material-symbols/svg-700/outlined/medication.svg?raw';
import vaccines from '@material-symbols/svg-700/outlined/vaccines.svg?raw';
import ventilator from '@material-symbols/svg-700/outlined/ventilator.svg?raw';
import surgical from '@material-symbols/svg-700/outlined/surgical.svg?raw';
import familyHome from '@material-symbols/svg-700/outlined/family_home.svg?raw';
import checklist from '@material-symbols/svg-700/outlined/checklist.svg?raw';
import flag from '@material-symbols/svg-700/outlined/flag.svg?raw';
import safetyCheck from '@material-symbols/svg-700/outlined/safety_check.svg?raw';
import logoUrl from '../assets/neocab-logo.svg';
import chevron from '@material-symbols/svg-700/outlined/chevron_forward.svg?raw';

// Kleur volgt de tekstkleur; grootte volgt de lettergrootte.
const prep = (svg: string) => svg.replace('<svg ', '<svg fill="currentColor" width="1em" height="1em" aria-hidden="true" focusable="false" ');

/** Material Symbols (outlined, gewicht 700) per sectie (id in het formulier). */
const BY_ID: Record<string, string> = {
  s1: prep(idCard),
  s2: prep(route),
  s3: prep(pregnantWoman),
  s4: prep(sick),
  sdispatch: prep(ambulance),
  s5: prep(clinicalNotes),
  s6: prep(timeline),
  s7: prep(labResearch),
  s8: prep(medication),
  s9: prep(vaccines),
  s10: prep(ventilator),
  s11: prep(surgical),
  s12: prep(familyHome),
  s13: prep(checklist),
  s14: prep(flag),
};

/** Sectietitels in het verslag → sectie-id. */
const ID_BY_TITLE: Record<string, string> = {
  'Basisgegevens kind': 's1',
  'Verwijzing en bestemming': 's2',
  'Zwangerschap en geboorte': 's3',
  'Toestand bij verwijzing': 's4',
  Dispatch: 'sdispatch',
  Stabilisatie: 's5',
  Tijdlijn: 's6',
  'Overige diagnostiek': 's7',
  Medicatietoedieningen: 's8',
  'Lopende infusen': 's9',
  'Lijnen, sondes, drains en endotracheale tube': 's10',
  'Procedures en gebeurtenissen': 's11',
  'Ouders en gezin': 's12',
  'Checklist voor vertrek': 's13',
  'Afsluiting transport': 's14',
};

/** Icoon bij een sectie: op id (formulier, navigatie) of op titel (verslag). */
export function SectionIcon({ id, title, className }: { id?: string; title?: string; className?: string }) {
  const key = id ?? (title ? ID_BY_TITLE[title] : undefined);
  const svg = key ? BY_ID[key] : undefined;
  if (!svg) return null;
  return <span className={`section-icon ${className ?? ''}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}

const EXPAND = prep(chevron);

/** Pijltje bij een in- en uitklapbaar blok (draait mee via CSS). */
export function ExpandIcon() {
  return <span className="expand-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: EXPAND }} />;
}

const TIMEPOINT = prep(safetyCheck);

/** Icoon bij de vaste tijdstippen van het transport (safety_check). */
export function TimepointIcon() {
  return <span className="tp-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: TIMEPOINT }} />;
}

/** Logo Neo.Cab (als afbeelding, zodat de mask-id in de svg niet botst bij meerdere exemplaren). */
export function Logo({ className }: { className?: string }) {
  return <img src={logoUrl} alt="Neo.Cab" className={`brand-logo ${className ?? ''}`} width={420} height={340} />;
}

export { logoUrl };
