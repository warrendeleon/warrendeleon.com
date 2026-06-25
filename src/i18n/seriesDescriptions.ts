import type { Locale } from './index';

// A one-or-two-line description for each series, keyed by the exact series name
// used in post frontmatter. Drives the blog hero, the series shelf cards, and the
// series hub page — so a series reads as a series rather than borrowing its intro
// post's description. Tagalog still wants a native-speaker pass.
const seriesDescriptions: Record<string, Record<Locale, string>> = {
  'React Native Module Federation': {
    en: 'Build a federated React Native app from scratch with Module Federation and Re.Pack: runtime remotes, the shared-singleton contract, and a host shell that owns navigation.',
    es: 'Construye una app React Native federada desde cero con Module Federation y Re.Pack: remotes en tiempo de ejecución, el contrato de singleton compartido y un host shell que controla la navegación.',
    ca: 'Construeix una app React Native federada des de zero amb Module Federation i Re.Pack: remots en temps d\'execució, el contracte de singleton compartit i un host shell que controla la navegació.',
    tl: 'Bumuo ng federated React Native app mula sa simula gamit ang Module Federation at Re.Pack: runtime remotes, ang shared-singleton contract, at host shell na may hawak ng navigation.',
  },
  'React Native Foundations': {
    en: 'The groundwork for a solid React Native project: API mocking, tiered secure storage, end-to-end testing, and a feature-first structure.',
    es: 'Las bases de un proyecto React Native sólido: simulación de APIs, almacenamiento seguro por niveles, pruebas end-to-end y una estructura feature-first.',
    ca: 'Les bases d\'un projecte React Native sòlid: simulació d\'APIs, emmagatzematge segur per nivells, proves end-to-end i una estructura feature-first.',
    tl: 'Ang pundasyon ng matatag na React Native project: API mocking, tiered secure storage, end-to-end testing, at feature-first na istraktura.',
  },
  'Hiring': {
    en: 'Rethinking how to hire React Native engineers: redesigning the tech test, scoring fairly from graduate to senior, and take-homes candidates actually finish.',
    es: 'Repensar cómo contratar ingenieros de React Native: rediseñar la prueba técnica, evaluar con justicia de graduado a sénior y pruebas para casa que los candidatos sí terminan.',
    ca: 'Repensar com contractar enginyers de React Native: redissenyar la prova tècnica, avaluar amb justícia de graduat a sènior i proves per a casa que els candidats sí que acaben.',
    tl: 'Muling pag-isipan kung paano mag-hire ng React Native engineers: pag-redesign ng tech test, patas na pag-score mula graduate hanggang senior, at take-home na natatapos talaga ng mga kandidato.',
  },
};

export const getSeriesDescription = (series: string, locale: Locale): string => {
  return seriesDescriptions[series]?.[locale] ?? seriesDescriptions[series]?.en ?? '';
};
