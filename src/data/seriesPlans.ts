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
    { title: 'The design system as a federated singleton', date: '2026-08-24' },
    { title: 'Accessibility testing across federated remotes', date: '2026-08-31' },
    { title: 'shell.navigateTo: RN ↔ native handoff', date: '2026-09-07' },
    { title: 'The production build and the three modes', date: '2026-09-14' },
    { title: 'CDN delivery: the version map, the resolver, and the live flip', date: '2026-09-21' },
    { title: 'Fallback: the copy in the binary and the net in the session', date: '2026-09-28' },
    { title: 'The signed map and the app that rolls itself back', date: '2026-10-05' },
  ],
};

export const getSeriesPlan = (series: string): PlannedPart[] => seriesPlans[series] ?? [];
