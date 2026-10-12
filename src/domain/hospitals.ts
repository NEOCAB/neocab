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

/**
 * Benaderde coördinaten (breedte, lengte) per locatie in de standaardlijst, voor een schatting van afstand en reistijd.
 * Locaties die via Instellingen zijn toegevoegd hebben geen coördinaten; dan alleen een link naar een routeplanner.
 */
export const HOSPITAL_COORDS: Record<string, [number, number]> = {
  'UMCG – Beatrix Kinderziekenhuis, Groningen': [53.2226, 6.5759],
  'Martini Ziekenhuis, Groningen': [53.199, 6.556],
  'Ommelander Ziekenhuis Groningen, Scheemda': [53.17, 6.975],
  'Frisius MC, Leeuwarden': [53.189, 5.801],
  'Frisius MC, Heerenveen': [52.953, 5.93],
  'Antonius Sneek, Sneek': [53.025, 5.665],
  'Nij Smellinghe, Drachten': [53.101, 6.088],
  'Treant – Scheper, Emmen': [52.789, 6.905],
  'Wilhelmina Ziekenhuis Assen, Assen': [52.985, 6.548],
  'Isala – Amalia Kinderafdeling, Zwolle': [52.515, 6.08],
  'Saxenburgh, Hardenberg': [52.576, 6.628],
  'Deventer Ziekenhuis, Deventer': [52.242, 6.187],
  'Medisch Spectrum Twente, Enschede': [52.216, 6.889],
  'ZGT, Almelo': [52.353, 6.661],
  'Flevoziekenhuis, Almere': [52.37, 5.215],
  'St Jansdal, Harderwijk': [52.341, 5.637],
  'Gelre ziekenhuizen, Apeldoorn': [52.218, 5.967],
  'Ziekenhuis Gelderse Vallei, Ede': [52.03, 5.666],
  'Rijnstate, Arnhem': [51.984, 5.918],
  'Radboudumc – Amalia Kinderziekenhuis, Nijmegen': [51.824, 5.86],
  'Canisius, Nijmegen': [51.834, 5.84],
  'Ziekenhuis Rivierenland, Tiel': [51.887, 5.417],
  'Santiz – Slingeland, Doetinchem': [51.962, 6.288],
  'Santiz – SKB, Winterswijk': [51.972, 6.724],
  'UMC Utrecht – Wilhelmina Kinderziekenhuis, Utrecht': [52.087, 5.179],
  'St. Antonius Ziekenhuis, Utrecht': [52.102, 5.044],
  'St. Antonius Ziekenhuis, Nieuwegein': [52.036, 5.093],
  'Diakonessenhuis, Utrecht': [52.082, 5.148],
  'Meander Medisch Centrum, Amersfoort': [52.181, 5.397],
  'Tergooi MC, Hilversum': [52.216, 5.16],
  'Amsterdam UMC – Emma Kinderziekenhuis, locatie AMC, Amsterdam': [52.294, 4.958],
  'Amsterdam UMC, locatie VUmc, Amsterdam': [52.334, 4.86],
  'OLVG, locatie Oost, Amsterdam': [52.358, 4.916],
  'OLVG, locatie West, Amsterdam': [52.378, 4.846],
  'BovenIJ ziekenhuis, Amsterdam': [52.403, 4.933],
  'Ziekenhuis Amstelland, Amstelveen': [52.293, 4.853],
  'Zaans Medisch Centrum, Zaandam': [52.447, 4.825],
  'Spaarne Gasthuis, Haarlem': [52.36, 4.66],
  'Spaarne Gasthuis, Hoofddorp': [52.299, 4.691],
  'Rode Kruis Ziekenhuis, Beverwijk': [52.479, 4.658],
  'Noordwest Ziekenhuisgroep, Alkmaar': [52.641, 4.738],
  'Noordwest Ziekenhuisgroep, Den Helder': [52.942, 4.762],
  'Dijklander Ziekenhuis, Hoorn': [52.646, 5.059],
  'Dijklander Ziekenhuis, Purmerend': [52.511, 4.954],
  'Alrijne Ziekenhuis, Leiderdorp': [52.16, 4.526],
  'Groene Hart Ziekenhuis, Gouda': [52.023, 4.699],
  'HMC Westeinde, Den Haag': [52.073, 4.302],
  'HagaZiekenhuis – Juliana Kinderziekenhuis, Den Haag': [52.049, 4.26],
  'Reinier de Graaf, Delft': [51.997, 4.374],
  'Erasmus MC – Sophia Kinderziekenhuis, Rotterdam': [51.91, 4.469],
  'Maasstad Ziekenhuis, Rotterdam': [51.87, 4.529],
  'Franciscus Gasthuis, Rotterdam': [51.944, 4.489],
  'Franciscus Vlietland, Schiedam': [51.928, 4.399],
  'Ikazia Ziekenhuis, Rotterdam': [51.88, 4.489],
  'IJsselland Ziekenhuis, Capelle aan den IJssel': [51.93, 4.585],
  'Spijkenisse Medisch Centrum, Spijkenisse': [51.848, 4.326],
  'Van Weel-Bethesda Ziekenhuis, Dirksland': [51.747, 4.1],
  'Albert Schweitzer ziekenhuis, Dordrecht': [51.797, 4.688],
  'Beatrixziekenhuis, Gorinchem': [51.841, 4.964],
  'Adrz, Goes': [51.497, 3.886],
  'ZorgSaam Ziekenhuis, Terneuzen': [51.329, 3.831],
  'Bravis ziekenhuis, Roosendaal': [51.532, 4.458],
  'Amphia, Breda': [51.577, 4.796],
  'ETZ – Elisabeth-TweeSteden Ziekenhuis, Tilburg': [51.564, 5.064],
  'Jeroen Bosch Ziekenhuis, ’s-Hertogenbosch': [51.683, 5.358],
  'Bernhoven, Uden': [51.66, 5.627],
  'Maasziekenhuis Pantein, Boxmeer': [51.648, 5.951],
  'Catharina Ziekenhuis, Eindhoven': [51.449, 5.473],
  'Máxima MC, Veldhoven': [51.405, 5.417],
  'Anna Ziekenhuis, Geldrop': [51.423, 5.556],
  'Elkerliek ziekenhuis, Helmond': [51.467, 5.66],
  'Maastricht UMC+, Maastricht': [50.833, 5.711],
  'Zuyderland Medisch Centrum, Heerlen': [50.889, 5.959],
  'Zuyderland Medisch Centrum, Sittard-Geleen': [50.999, 5.842],
  'Laurentius Ziekenhuis, Roermond': [51.189, 5.989],
  'VieCuri Medisch Centrum, Venlo': [51.374, 6.166],
};

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
