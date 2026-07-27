// One Person entity for the whole site, referenced from every page.
//
// The home page and every blog post used to declare their own unlinked Person
// node, so nothing in the markup said the author of the posts is the person the
// site is about. A shared @id is what merges them into a single entity; the
// fragments hang off the canonical home page URL so the identifiers stay stable
// whatever locale or page emits them.
//
// BaseLayout puts these on every page inside one @graph, which is why the
// references below are bare @id: the node they point at is in the same graph.

export const SITE_URL = 'https://warrendeleon.com';
export const PERSON_ID = `${SITE_URL}/#person`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

/** Reference to the Person from another node in the same graph. */
export const personRef = { '@id': PERSON_ID };

/** The full definition. Emitted once per page, inside the graph. */
export const personNode = {
  '@type': 'Person',
  '@id': PERSON_ID,
  name: 'Warren de Leon',
  alternateName: ['Warren de Leon Ofalla', 'Warren de Leon LTD', 'warren_deleon', 'warrendeleon', 'warren.deleon'],
  jobTitle: 'Software Engineering Manager',
  url: SITE_URL,
  image: `${SITE_URL}/images/warren-deleon-headshot.webp`,
  // The author page: the one page that is about him and lists everything he
  // has written. Names the canonical entry for the entity.
  mainEntityOfPage: { '@id': `${SITE_URL}/about/#webpage` },
  sameAs: [
    'https://linkedin.com/in/warrendeleon',
    'https://x.com/warren_deleon',
    'https://instagram.com/warrendeleon',
    'https://facebook.com/warren.deleon',
    'https://github.com/warrendeleon',
  ],
};

export const websiteNode = {
  '@type': 'WebSite',
  '@id': WEBSITE_ID,
  url: `${SITE_URL}/`,
  name: 'Warren de Leon',
  publisher: personRef,
  author: personRef,
  copyrightHolder: personRef,
  inLanguage: ['en', 'es', 'ca', 'tl'],
};

type PageGraphInput = {
  url: string;
  name: string;
  description: string;
  locale: string;
  /** ProfilePage on the pages that are about him rather than merely written by him. */
  isProfilePage?: boolean;
  /** Page-specific nodes (BlogPosting, ItemList) to carry in the same graph. */
  extra?: unknown;
};

/**
 * The JSON-LD graph for one page: the page itself, the site it belongs to, and
 * the person behind both. Every page gets all three, so a crawler that only
 * ever fetches one page still sees the whole entity.
 */
export function buildPageGraph({ url, name, description, locale, isProfilePage, extra }: PageGraphInput) {
  const webPage: Record<string, unknown> = {
    '@type': isProfilePage ? ['WebPage', 'ProfilePage'] : 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name,
    description,
    inLanguage: locale,
    isPartOf: { '@id': WEBSITE_ID },
    author: personRef,
    publisher: personRef,
    copyrightHolder: personRef,
  };
  // A ProfilePage states its subject; every other page is only authored by
  // him. Google's ProfilePage guidance reads mainEntity, so set both.
  if (isProfilePage) {
    webPage.about = personRef;
    webPage.mainEntity = personRef;
  }

  const extras = extra ? (Array.isArray(extra) ? extra : [extra]) : [];
  return {
    '@context': 'https://schema.org',
    '@graph': [webPage, websiteNode, personNode, ...extras],
  };
}
