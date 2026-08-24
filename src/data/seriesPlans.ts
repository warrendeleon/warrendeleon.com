// The full programmed arc of each series, so the series hub always shows
// every part (design: unpublished parts render dimmed with "Planned · date").
// A real post overlays its entry here via the title dedup in
// BlogSeriesPage.astro, so published parts stay listed but never duplicate;
// a scheduled post that has a file but has not reached its 08:30 slot is
// covered by its entry too, instead of vanishing from the arc.
//
// Source of truth: the blog content strategy (wiki blog-content-strategy,
// 17-post layout of 2026-07-27). Titles and dates only — the strategy doc's
// descriptions are internal planning notes and stay off the site. Entries for
// parts that already have a post file MUST carry the post's exact title, or
// the dedup misses and the part counts twice.
//
// Titles are English in every locale until the posts (and their
// translations) exist.

export interface PlannedPart {
  title: string;
  date: string; // ISO yyyy-mm-dd (planned Monday slot)
}

const seriesPlans: Record<string, PlannedPart[]> = {
  'React Native Module Federation': [
    { title: 'Why Module Federation in React Native', date: '2026-06-01' },
    { title: 'Your first federated remote in React Native', date: '2026-06-08' },
    { title: 'The shared-singleton contract in React Native Module Federation', date: '2026-06-15' },
    { title: 'The host shell: federated remotes as tabs in React Native', date: '2026-06-22' },
    { title: 'The contract package: a versioned seam between federated remotes in React Native', date: '2026-06-29' },
    { title: 'One shared store: server state across federated remotes in React Native', date: '2026-07-20' },
    { title: 'Who owns what: boundaries, teams and coupling in a federated React Native app', date: '2026-07-27' },
    { title: 'Client state across the seam: remotes that bring their own slices in React Native', date: '2026-08-03' },
    { title: 'State stacks under federation: the same React Native app built twice', date: '2026-08-10' },
    { title: 'Two backends, one client? RTK Query vs Apollo in React Native', date: '2026-08-17' },
    { title: 'The design system as a federated singleton in React Native', date: '2026-08-31' },
    { title: 'Accessibility testing across federated remotes', date: '2026-09-07' },
    { title: 'shell.navigateTo: RN ↔ native handoff', date: '2026-09-14' },
    { title: 'The production build and the three modes', date: '2026-09-21' },
    { title: 'CDN delivery: the version map, the resolver, and the live flip', date: '2026-09-28' },
    { title: 'Fallback: the copy in the binary and the net in the session', date: '2026-10-05' },
    { title: 'The signed map and the app that rolls itself back', date: '2026-10-12' },
  ],
};

export const getSeriesPlan = (series: string): PlannedPart[] => seriesPlans[series] ?? [];
