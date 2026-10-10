import idCard from '@material-symbols/svg-400/outlined/id_card.svg?raw';
import route from '@material-symbols/svg-400/outlined/route.svg?raw';
import pregnantWoman from '@material-symbols/svg-400/outlined/pregnant_woman.svg?raw';
import sick from '@material-symbols/svg-400/outlined/sick.svg?raw';
import ambulance from '@material-symbols/svg-400/outlined/ambulance.svg?raw';
import clinicalNotes from '@material-symbols/svg-400/outlined/clinical_notes.svg?raw';
import timeline from '@material-symbols/svg-400/outlined/timeline.svg?raw';
import labResearch from '@material-symbols/svg-400/outlined/lab_research.svg?raw';
import medication from '@material-symbols/svg-400/outlined/medication.svg?raw';
import vaccines from '@material-symbols/svg-400/outlined/vaccines.svg?raw';
import ventilator from '@material-symbols/svg-400/outlined/ventilator.svg?raw';
import surgical from '@material-symbols/svg-400/outlined/surgical.svg?raw';
import familyHome from '@material-symbols/svg-400/outlined/family_home.svg?raw';
import checklist from '@material-symbols/svg-400/outlined/checklist.svg?raw';
import flag from '@material-symbols/svg-400/outlined/flag.svg?raw';

/** Material Symbols (outlined) per sectienummer, zoals gekozen. */
const BY_NUMBER: Record<number, string> = {
  1: idCard,
  2: route,
  3: pregnantWoman,
  4: sick,
  5: ambulance,
  6: clinicalNotes,
  7: timeline,
  8: labResearch,
  9: medication,
  10: vaccines,
  11: ventilator,
  12: surgical,
  13: familyHome,
  14: checklist,
  15: flag,
};

/** Sectienummer uit een titel als "7 Tijdlijn: …". */
export function sectionNumber(title: string): number | null {
  const m = /^(\d+)\s/.exec(title);
  return m ? Number(m[1]) : null;
}

// Kleur volgt de tekstkleur; grootte volgt de lettergrootte.
const prepare = (svg: string) => svg.replace('<svg ', '<svg fill="currentColor" width="1em" height="1em" aria-hidden="true" focusable="false" ');
const PREPARED = Object.fromEntries(Object.entries(BY_NUMBER).map(([k, v]) => [k, prepare(v)])) as Record<number, string>;

/** Icoon bij een sectietitel (op basis van het nummer vooraan de titel). */
export function SectionIcon({ title, className }: { title: string; className?: string }) {
  const n = sectionNumber(title);
  if (n === null || !PREPARED[n]) return null;
  return <span className={`section-icon ${className ?? ''}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: PREPARED[n] }} />;
}
