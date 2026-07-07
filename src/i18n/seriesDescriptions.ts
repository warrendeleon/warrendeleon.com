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
  'Supabase Security': {
    en: 'Harden a React Native + Supabase stack end to end: typed Axios auth and storage clients, token-refresh races, certificate pinning, PII-safe logging, and RLS policies that hold.',
    es: 'Blinda un stack React Native + Supabase de punta a punta: clientes Axios tipados de auth y storage, carreras de refresco de token, certificate pinning, logs sin PII y políticas RLS que aguantan.',
    ca: "Blinda un stack React Native + Supabase de punta a punta: clients Axios tipats d'auth i storage, curses de refresc de token, certificate pinning, logs sense PII i polítiques RLS que aguanten.",
    tl: 'Patibayin ang React Native + Supabase stack mula dulo hanggang dulo: typed Axios auth at storage clients, token-refresh races, certificate pinning, PII-safe logging, at RLS policies na tumatagal.',
  },
  'Testing and Infrastructure': {
    en: 'Deterministic React Native testing beyond unit specs: Metro-level backend mocking for Detox, Zod contract validation at runtime, and automated accessibility and i18n parity checks.',
    es: 'Testing determinista en React Native más allá de los tests unitarios: mocking del backend a nivel de Metro para Detox, validación de contratos con Zod en runtime y comprobaciones automáticas de accesibilidad y paridad i18n.',
    ca: "Testing determinista en React Native més enllà dels tests unitaris: mocking del backend a nivell de Metro per a Detox, validació de contractes amb Zod en runtime i comprovacions automàtiques d'accessibilitat i paritat i18n.",
    tl: 'Deterministic na React Native testing lampas sa unit specs: Metro-level backend mocking para sa Detox, runtime contract validation gamit ang Zod, at automated na accessibility at i18n parity checks.',
  },
  'State Management': {
    en: 'How to choose state management with a clear head: server state vs client state, cache-invalidation shapes that steer team habits, and what Module Federation changes about the question.',
    es: 'Cómo elegir la gestión de estado con la cabeza fría: estado de servidor frente a estado de cliente, formas de invalidación de caché que moldean los hábitos del equipo y qué cambia Module Federation en la pregunta.',
    ca: "Com triar la gestió d'estat amb el cap fred: estat de servidor davant estat de client, formes d'invalidació de cau que modelen els hàbits de l'equip i què canvia Module Federation en la pregunta.",
    tl: 'Paano pumili ng state management nang malinaw ang isip: server state laban sa client state, mga hugis ng cache invalidation na humuhubog sa gawi ng team, at kung ano ang binabago ng Module Federation sa tanong.',
  },
  'Claude RAG + Tooling': {
    en: 'How I gave Claude Code a local memory: a RAG over conversation transcripts, the fswatch-to-ChromaDB indexing pipeline, a FastMCP tool server, and a curated wiki that answers what search only recalls.',
    es: 'Cómo le di memoria local a Claude Code: un RAG sobre transcripciones de conversaciones, el pipeline de indexado de fswatch a ChromaDB, un servidor de herramientas FastMCP y una wiki curada que responde lo que la búsqueda solo recuerda.',
    ca: "Com vaig donar memòria local a Claude Code: un RAG sobre transcripcions de converses, el pipeline d'indexació de fswatch a ChromaDB, un servidor d'eines FastMCP i una wiki curada que respon el que la cerca només recorda.",
    tl: 'Paano ko binigyan ng lokal na memorya ang Claude Code: RAG sa mga transcript ng usapan, ang fswatch-papuntang-ChromaDB indexing pipeline, FastMCP tool server, at curated wiki na sumasagot sa naaalala lang ng search.',
  },
};

// Companion repositories, where a series has one (drives the sidebar card on
// the series hub page — design "Series Tablet/Desktop"). Only list repos that
// actually exist and are public.
const seriesRepos: Record<string, string> = {
  'React Native Module Federation': 'https://github.com/warrendeleon/react-native-module-federation',
};

export const getSeriesRepo = (series: string): string | null => seriesRepos[series] ?? null;

export const getSeriesDescription = (series: string, locale: Locale): string => {
  return seriesDescriptions[series]?.[locale] ?? seriesDescriptions[series]?.en ?? '';
};
