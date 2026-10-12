/**
 * Ziekenhuislocaties in Nederland met een klinische afdeling kindergeneeskunde en/of neonatologie, voor de keuzelijst
 * bij verwijzend en ontvangend ziekenhuis. NICU = intensive care neonatologie (derdelijns perinatologisch centrum).
 *
 * Samengesteld oktober 2026 op basis van openbare informatie; er bestaat geen officieel landelijk register van
 * klinische kinderafdelingen en ziekenhuizen fuseren of verplaatsen zorg. De lijst is daarom aan te passen via
 * Instellingen, en in het veld kan altijd vrije tekst worden ingevuld.
 *
 * Formaat per regel: "Naam, Plaats" met optioneel " | NICU".
 */
export const DEFAULT_HOSPITAL_LINES: string[] = [
  // Groningen, Friesland, Drenthe
  'UMCG – Beatrix Kinderziekenhuis, Groningen | NICU',
  'Martini Ziekenhuis, Groningen',
  'Ommelander Ziekenhuis Groningen, Scheemda',
  'Frisius MC, Leeuwarden',
  'Frisius MC, Heerenveen',
  'Antonius Sneek, Sneek',
  'Nij Smellinghe, Drachten',
  'Treant – Scheper, Emmen',
  'Wilhelmina Ziekenhuis Assen, Assen',
  // Overijssel, Flevoland
  'Isala – Amalia Kinderafdeling, Zwolle | NICU',
  'Saxenburgh, Hardenberg',
  'Deventer Ziekenhuis, Deventer',
  'Medisch Spectrum Twente, Enschede',
  'ZGT, Almelo',
  'Flevoziekenhuis, Almere',
  // Gelderland
  'St Jansdal, Harderwijk',
  'Gelre ziekenhuizen, Apeldoorn',
  'Ziekenhuis Gelderse Vallei, Ede',
  'Rijnstate, Arnhem',
  'Radboudumc – Amalia Kinderziekenhuis, Nijmegen | NICU',
  'Canisius, Nijmegen',
  'Ziekenhuis Rivierenland, Tiel',
  'Santiz – Slingeland, Doetinchem',
  'Santiz – SKB, Winterswijk',
  // Utrecht
  'UMC Utrecht – Wilhelmina Kinderziekenhuis, Utrecht | NICU',
  'St. Antonius Ziekenhuis, Utrecht',
  'St. Antonius Ziekenhuis, Nieuwegein',
  'Diakonessenhuis, Utrecht',
  'Meander Medisch Centrum, Amersfoort',
  'Tergooi MC, Hilversum',
  // Noord-Holland
  'Amsterdam UMC – Emma Kinderziekenhuis, locatie AMC, Amsterdam | NICU',
  'Amsterdam UMC, locatie VUmc, Amsterdam',
  'OLVG, locatie Oost, Amsterdam',
  'OLVG, locatie West, Amsterdam',
  'BovenIJ ziekenhuis, Amsterdam',
  'Ziekenhuis Amstelland, Amstelveen',
  'Zaans Medisch Centrum, Zaandam',
  'Spaarne Gasthuis, Haarlem',
  'Spaarne Gasthuis, Hoofddorp',
  'Rode Kruis Ziekenhuis, Beverwijk',
  'Noordwest Ziekenhuisgroep, Alkmaar',
  'Noordwest Ziekenhuisgroep, Den Helder',
  'Dijklander Ziekenhuis, Hoorn',
  'Dijklander Ziekenhuis, Purmerend',
  // Zuid-Holland
  'Alrijne Ziekenhuis, Leiderdorp',
  'Groene Hart Ziekenhuis, Gouda',
  'HMC Westeinde, Den Haag',
  'HagaZiekenhuis – Juliana Kinderziekenhuis, Den Haag',
  'Reinier de Graaf, Delft',
  'Erasmus MC – Sophia Kinderziekenhuis, Rotterdam | NICU',
  'Maasstad Ziekenhuis, Rotterdam',
  'Franciscus Gasthuis, Rotterdam',
  'Franciscus Vlietland, Schiedam',
  'Ikazia Ziekenhuis, Rotterdam',
  'IJsselland Ziekenhuis, Capelle aan den IJssel',
  'Spijkenisse Medisch Centrum, Spijkenisse',
  'Van Weel-Bethesda Ziekenhuis, Dirksland',
  'Albert Schweitzer ziekenhuis, Dordrecht',
  'Beatrixziekenhuis, Gorinchem',
  // Zeeland, Noord-Brabant
  'Adrz, Goes',
  'ZorgSaam Ziekenhuis, Terneuzen',
  'Bravis ziekenhuis, Roosendaal',
  'Amphia, Breda',
  'ETZ – Elisabeth-TweeSteden Ziekenhuis, Tilburg',
  'Jeroen Bosch Ziekenhuis, ’s-Hertogenbosch',
  'Bernhoven, Uden',
  'Maasziekenhuis Pantein, Boxmeer',
  'Catharina Ziekenhuis, Eindhoven',
  'Máxima MC, Veldhoven | NICU',
  'Anna Ziekenhuis, Geldrop',
  'Elkerliek ziekenhuis, Helmond',
  // Limburg
  'Maastricht UMC+, Maastricht | NICU',
  'Zuyderland Medisch Centrum, Heerlen',
  'Zuyderland Medisch Centrum, Sittard-Geleen',
  'Laurentius Ziekenhuis, Roermond',
  'VieCuri Medisch Centrum, Venlo',
];

export interface HospitalOption {
  /** Wat in het veld komt: "Naam, Plaats". */
  label: string;
  nicu: boolean;
}

/** Leest een regel uit de (aanpasbare) lijst: "Naam, Plaats" met optioneel " | NICU". */
export function parseHospitalLine(line: string): HospitalOption | null {
  const [label, flag] = line.split('|').map((s) => s.trim());
  if (!label) return null;
  return { label, nicu: /^nicu$/i.test(flag ?? '') };
}

export function hospitalOptions(lines: string[]): HospitalOption[] {
  return lines.map(parseHospitalLine).filter((h): h is HospitalOption => h !== null);
}

/** Zoeken zonder hoofdletters en accenten; alle woorden moeten voorkomen (bijv. "sophia rotterdam", "maxima"). */
export function matchesHospital(h: HospitalOption, query: string): boolean {
  const norm = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  const text = norm(`${h.label}${h.nicu ? ' nicu' : ''}`);
  return norm(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => text.includes(w));
}
