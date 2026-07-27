import type { Locale } from './index';
import { t } from './index';
import { getTagLabel } from './tagLabels';
import { truncateAtWord } from '../utils/text';

// Meta descriptions for the tag pages. Google discards a description that is
// only a few words and scrapes the page instead — on these pages the first
// block of prose it found was the subscribe form, so every tag page in the
// index read "No spam. Full name. Email address."
//
// Two sources. The tags with enough posts behind them to promise something
// specific are written by hand below. Everything else composes from the tag's
// own posts (see below), so a tag is described the day it first appears and
// stays accurate as posts are added, rather than needing 70 hand-written
// strings per locale that go stale on the next publish.
const tagDescriptions: Record<string, Record<Locale, string>> = {
  'react-native': {
    en: 'React Native posts on architecture, testing, secure storage, state management and Module Federation, from a decade of shipping production mobile apps.',
    es: 'Artículos sobre React Native: arquitectura, testing, almacenamiento seguro, gestión de estado y Module Federation, desde una década construyendo apps móviles.',
    ca: "Articles sobre React Native: arquitectura, testing, emmagatzematge segur, gestió d'estat i Module Federation, des d'una dècada construint apps mòbils.",
    tl: 'Mga post tungkol sa React Native: arkitektura, testing, secure storage, state management at Module Federation, mula sa isang dekada ng paggawa ng mobile apps.',
  },
  'module-federation': {
    en: 'Module Federation in React Native: runtime remotes, the shared-singleton contract, host shells that own navigation, and what it costs to run in production.',
    es: 'Module Federation en React Native: remotes en tiempo de ejecución, el contrato de singleton compartido, host shells que controlan la navegación y su coste en producción.',
    ca: "Module Federation en React Native: remots en temps d'execució, el contracte de singleton compartit, host shells que controlen la navegació i el seu cost en producció.",
    tl: 'Module Federation sa React Native: runtime remotes, ang shared-singleton contract, host shells na may hawak ng navigation, at ang gastos nito sa produksyon.',
  },
  're-pack': {
    en: 'Re.Pack for React Native: replacing Metro with Rspack, wiring runtime remotes, and the bundler config a federated app actually needs.',
    es: 'Re.Pack para React Native: sustituir Metro por Rspack, conectar remotes en tiempo de ejecución y la configuración de bundler que necesita una app federada.',
    ca: "Re.Pack per a React Native: substituir Metro per Rspack, connectar remots en temps d'execució i la configuració de bundler que necessita una app federada.",
    tl: 'Re.Pack para sa React Native: pagpapalit ng Metro ng Rspack, pag-wire ng runtime remotes, at ang bundler config na kailangan talaga ng federated app.',
  },
  'rspack': {
    en: 'Rspack in React Native builds: how it replaces Metro under Re.Pack, the Module Federation plugins, and the build config that keeps remotes in sync.',
    es: 'Rspack en builds de React Native: cómo sustituye a Metro bajo Re.Pack, los plugins de Module Federation y la configuración que mantiene los remotes sincronizados.',
    ca: 'Rspack en builds de React Native: com substitueix Metro sota Re.Pack, els plugins de Module Federation i la configuració que manté els remots sincronitzats.',
    tl: 'Rspack sa React Native builds: paano nito pinapalitan ang Metro sa ilalim ng Re.Pack, ang Module Federation plugins, at ang build config na nagpapa-sync sa remotes.',
  },
  'tutorial': {
    en: 'Step-by-step React Native build-alongs: copy-paste commands, working code at every stage, and a running app at the end of each part.',
    es: 'Tutoriales de React Native paso a paso: comandos para copiar y pegar, código que funciona en cada etapa y una app en marcha al final de cada parte.',
    ca: 'Tutorials de React Native pas a pas: ordres per copiar i enganxar, codi que funciona a cada etapa i una app en marxa al final de cada part.',
    tl: 'Hakbang-hakbang na React Native build-along: kopyahin-idikit na mga command, gumaganang code sa bawat yugto, at tumatakbong app sa dulo ng bawat parte.',
  },
  'engineering-management': {
    en: 'Engineering management in practice: coaching engineers, running mobile squads, giving honest feedback, and the parts of leading a team nobody warns you about.',
    es: 'Gestión de ingeniería en la práctica: acompañar a ingenieros, dirigir squads móviles, dar feedback honesto y las partes de liderar de las que nadie te avisa.',
    ca: "Gestió d'enginyeria a la pràctica: acompanyar enginyers, dirigir squads mòbils, donar feedback honest i les parts de liderar de les quals ningú t'avisa.",
    tl: 'Engineering management sa praktika: pag-coach ng mga engineer, pamamahala ng mobile squads, tapat na feedback, at ang bahagi ng pamumuno na hindi binabanggit.',
  },
  'hiring': {
    en: 'Hiring React Native engineers: redesigning the tech test, scoring fairly from graduate to senior, and take-homes candidates actually finish.',
    es: 'Contratar ingenieros de React Native: rediseñar la prueba técnica, evaluar con justicia de graduado a sénior y pruebas para casa que los candidatos sí terminan.',
    ca: 'Contractar enginyers de React Native: redissenyar la prova tècnica, avaluar amb justícia de graduat a sènior i proves per a casa que els candidats sí que acaben.',
    tl: 'Pag-hire ng React Native engineers: pag-redesign ng tech test, patas na pag-score mula graduate hanggang senior, at take-home na natatapos talaga ng mga kandidato.',
  },
  'redux': {
    en: "Redux in React Native: where it still earns its place, what RTK Query takes over, and how cache invalidation shapes a team's habits.",
    es: 'Redux en React Native: dónde sigue mereciendo su sitio, qué asume RTK Query y cómo la invalidación de caché moldea los hábitos del equipo.',
    ca: "Redux en React Native: on encara té sentit, què assumeix RTK Query i com la invalidació de cau modela els hàbits de l'equip.",
    tl: 'Redux sa React Native: saan ito may saysay pa rin, ano ang kinukuha ng RTK Query, at paano hinuhubog ng cache invalidation ang gawi ng team.',
  },
  'rtk-query': {
    en: 'RTK Query in React Native: server state without the boilerplate, tag-based cache invalidation, and when TanStack Query is the better fit.',
    es: 'RTK Query en React Native: estado de servidor sin boilerplate, invalidación de caché por tags y cuándo encaja mejor TanStack Query.',
    ca: 'RTK Query en React Native: estat de servidor sense boilerplate, invalidació de cau per tags i quan encaixa millor TanStack Query.',
    tl: 'RTK Query sa React Native: server state nang walang boilerplate, tag-based na cache invalidation, at kailan mas bagay ang TanStack Query.',
  },
  'security': {
    en: 'Mobile security for React Native: token storage, certificate pinning, PII-safe logging, OWASP MASVS checks, and Supabase RLS policies that hold.',
    es: 'Seguridad móvil en React Native: almacenamiento de tokens, certificate pinning, logs sin PII, controles OWASP MASVS y políticas RLS de Supabase que aguantan.',
    ca: 'Seguretat mòbil en React Native: emmagatzematge de tokens, certificate pinning, logs sense PII, controls OWASP MASVS i polítiques RLS de Supabase que aguanten.',
    tl: 'Mobile security para sa React Native: token storage, certificate pinning, PII-safe logging, OWASP MASVS checks, at Supabase RLS policies na tumatagal.',
  },
  'supabase': {
    en: 'React Native with Supabase: typed Axios clients instead of the SDK, token-refresh races, storage uploads, and row-level security that holds.',
    es: 'React Native con Supabase: clientes Axios tipados en lugar del SDK, carreras de refresco de token, subidas a storage y row-level security que aguanta.',
    ca: "React Native amb Supabase: clients Axios tipats en lloc de l'SDK, curses de refresc de token, pujades a storage i row-level security que aguanta.",
    tl: 'React Native kasama ang Supabase: typed Axios clients sa halip na SDK, token-refresh races, storage uploads, at row-level security na tumatagal.',
  },
  'testing': {
    en: 'Testing React Native: Jest and Testing Library, Detox end-to-end runs, Metro-level API mocking, and accessibility checks that catch real faults.',
    es: 'Testing en React Native: Jest y Testing Library, Detox de punta a punta, mocking de APIs a nivel de Metro y comprobaciones de accesibilidad que detectan fallos reales.',
    ca: "Testing en React Native: Jest i Testing Library, Detox de punta a punta, mocking d'APIs a nivell de Metro i comprovacions d'accessibilitat que detecten errors reals.",
    tl: 'Testing sa React Native: Jest at Testing Library, Detox end-to-end, Metro-level API mocking, at accessibility checks na nakakahuli ng totoong depekto.',
  },
};

// Meta descriptions cap out around 160 characters in the SERP; past that Google
// cuts mid-phrase.
const MAX_DESCRIPTION = 160;

type TagPost = { data: { title: string; tags?: string[] } };

/**
 * Meta description for a tag page: the curated line where one exists, otherwise
 * one composed from the tag's own posts — how many, which other tags they sit
 * under, and the most recent title. Posts must arrive newest-first, which is
 * how every tag route sorts them.
 */
export function getTagDescription(tag: string, locale: Locale, posts: TagPost[]): string {
  const curated = tagDescriptions[tag]?.[locale];
  if (curated) return curated;

  const i18n = t(locale);
  const label = getTagLabel(tag, locale);
  const postWord = posts.length === 1 ? i18n.blog.post : i18n.blog.posts;

  // Co-occurring tags, most frequent first, are what this tag is actually
  // about — a better summary than the tag slug repeated back at the reader.
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const other of post.data.tags ?? []) {
      if (other !== tag) counts.set(other, (counts.get(other) ?? 0) + 1);
    }
  }
  const topics = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([other]) => getTagLabel(other, locale));

  const template = topics.length > 0 ? i18n.seo.tagDescription : i18n.seo.tagDescriptionNoTopics;
  const fill = (latest: string) => template
    .replace('{n}', String(posts.length))
    .replace('{posts}', postWord)
    .replace('{tag}', label)
    .replace('{topics}', new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(topics))
    .replace('{latest}', latest);

  // Trim the post title rather than the whole sentence, so the description
  // always ends on its own full stop instead of a title cut mid-word.
  const latest = posts[0]?.data.title ?? '';
  const budget = MAX_DESCRIPTION - fill('').length;
  // A cut title already ends in an ellipsis; the template's full stop after it
  // would read as "…." .
  return fill(truncateAtWord(latest, Math.max(budget, 0))).replace('….', '…');
}
