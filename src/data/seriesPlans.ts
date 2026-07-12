// Planned series parts that have no .md file yet, so the series hub can show
// the whole arc (design: planned parts render dimmed with "Planned · date").
//
// Source of truth: the blog content strategy (wiki blog-content-strategy,
// publishing calendar of 2026-06-22). Titles and dates only — the strategy
// doc's descriptions are internal planning notes and stay off the site.
// Once a part gets a real post file, remove its entry here (a safety-net
// title dedup also guards against forgetting).
//
// Titles are English in every locale until the posts (and their
// translations) exist.

export interface PlannedPart {
  title: string;
  date: string; // ISO yyyy-mm-dd (planned Monday slot)
}

const seriesPlans: Record<string, PlannedPart[]> = {
  'React Native Module Federation': [
    { title: 'The design system as a federated singleton', date: '2026-08-17' },
    { title: 'Accessibility testing across federated remotes', date: '2026-08-24' },
    { title: 'shell.navigateTo: RN ↔ native handoff', date: '2026-08-31' },
    { title: 'The production build and the three modes', date: '2026-09-07' },
    { title: 'Loading remotes from a CDN + version resolution', date: '2026-09-14' },
    { title: 'The live two-version flip', date: '2026-09-21' },
    { title: 'Offline fallback baked into the binary', date: '2026-09-28' },
    { title: 'In-session fallback when a remote fails', date: '2026-10-05' },
    { title: 'Signing the version-map + replay/rollback guard', date: '2026-10-12' },
    { title: 'Health-based cross-launch auto-rollback', date: '2026-10-19' },
  ],
};

export const getSeriesPlan = (series: string): PlannedPart[] => seriesPlans[series] ?? [];
