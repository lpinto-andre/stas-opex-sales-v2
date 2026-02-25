export type UiLang = 'fr' | 'en';

export const uiText = {
  en: {
    filters: 'Filters',
    filtersTip: 'Tip: tick multiple values in each filter to combine selections freely.',
    searchCustomer: 'Search customer',
    searchCountry: 'Search country',
    searchTerritory: 'Search territory',
    searchPart: 'Search part',
    searchGroup: 'Search group',
    searchClass: 'Search class',
    lineDescContains: 'LineDesc contains'
  },
  fr: {
    filters: 'Filtres',
    filtersTip: 'Astuce : cochez plusieurs valeurs dans chaque filtre pour combiner les sélections.',
    searchCustomer: 'Rechercher client',
    searchCountry: 'Rechercher pays',
    searchTerritory: 'Rechercher territoire',
    searchPart: 'Rechercher article',
    searchGroup: 'Rechercher groupe',
    searchClass: 'Rechercher classe',
    lineDescContains: 'LineDesc contient'
  }
} as const;
