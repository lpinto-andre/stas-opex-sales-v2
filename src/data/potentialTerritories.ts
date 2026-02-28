export type TerritoryGroup = 'america_africa' | 'europe_mo' | 'asia_oceania' | 'unknown';

export const TERRITORY_GROUP_ORDER: TerritoryGroup[] = ['america_africa', 'europe_mo', 'asia_oceania', 'unknown'];

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const tokenize = (value: string) => normalize(value).split(/\s+/).filter(Boolean);
const hasToken = (tokens: Set<string>, values: string[]) => values.some((value) => tokens.has(value));
const hasPhrase = (source: string, phrases: string[]) => phrases.some((phrase) => source.includes(phrase));

export function detectTerritoryGroup(fileName: string): TerritoryGroup {
  const source = normalize(fileName);
  const tokens = new Set(tokenize(fileName));

  const hasAmerica = hasToken(tokens, ['america', 'amerique', 'americas']);
  const hasAfrica = hasToken(tokens, ['africa', 'afrique']);
  const hasEurope = hasToken(tokens, ['europe']);
  const hasMiddleEast = hasToken(tokens, ['mo']) || hasPhrase(source, ['middle east', 'moyen orient']);
  const hasAsia = hasToken(tokens, ['asia', 'asie']);
  const hasOceania = hasToken(tokens, ['oceania', 'oceanie']);

  if ((hasAmerica && hasAfrica) || hasPhrase(source, ['america africa', 'amerique afrique'])) return 'america_africa';
  if ((hasEurope && hasMiddleEast) || hasPhrase(source, ['europe middle east', 'europe moyen orient', 'europe mo'])) return 'europe_mo';
  if ((hasAsia && hasOceania) || hasPhrase(source, ['asia oceania', 'asie oceanie'])) return 'asia_oceania';

  if (hasAmerica || hasAfrica) return 'america_africa';
  if (hasEurope || hasMiddleEast) return 'europe_mo';
  if (hasAsia || hasOceania) return 'asia_oceania';
  return 'unknown';
}

export function territoryGroupLabel(group: TerritoryGroup, lang: 'fr' | 'en'): string {
  const labelsFr: Record<TerritoryGroup, string> = {
    america_africa: 'Amérique et Afrique',
    europe_mo: 'Europe et Moyen-Orient (MO)',
    asia_oceania: 'Asie et Océanie',
    unknown: 'Non classé'
  };
  const labelsEn: Record<TerritoryGroup, string> = {
    america_africa: 'America and Africa',
    europe_mo: 'Europe and Middle-East (MO)',
    asia_oceania: 'Asia and Oceania',
    unknown: 'Unclassified'
  };
  return lang === 'fr' ? labelsFr[group] : labelsEn[group];
}
