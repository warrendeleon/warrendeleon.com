# warrendeleon.com

Personal website and multilingual blog. Built with [Astro](https://astro.build/).

**Live:** [warrendeleon.com](https://warrendeleon.com)

## What's in here

- **Portfolio** with work experience, education, CV, and a hiring page
- **Blog** with 12 posts (and growing) covering engineering management, hiring, and React Native
- **4 locales**: English, Spanish (Spain), Catalan, Tagalog
- **RSS feed** at `/rss.xml`

## Project structure

```
src/
├── components/         # Shared UI components (Nav, Footer, etc.)
│   └── blog/           # Blog-specific components (BlogPost, BlogListing)
├── content/
│   └── blog/           # Markdown blog posts
│       ├── *.md        # English (default)
│       ├── es/         # Spanish translations
│       ├── ca/         # Catalan translations
│       └── tl/         # Tagalog translations
├── i18n/               # Translation strings (en/es/ca/tl JSON files)
├── layouts/            # BaseLayout
├── pages/              # Astro page routes
│   ├── blog/           # Blog listing and post pages
│   ├── es/             # Spanish routes
│   ├── ca/             # Catalan routes
│   └── tl/             # Tagalog routes
└── utils/              # Blog helpers, reading time
```

## Blog

Posts are markdown files in `src/content/blog/`. Each post has a frontmatter schema defined in `src/content.config.ts` with required fields: `title`, `description`, `publishDate`, `tags`, `locale`, `campaign`.

Posts with a future `publishDate` are visible on localhost but hidden in production. The client-side filter in `BlogListing.astro` handles this.

Translations share the same slug across locales. The English post lives at the root, translations in their locale subdirectory.

## Deployment

Deployed to IONOS via a self-hosted blog-publisher service that:

1. Listens for GitHub webhooks on push to `main`
2. Pulls, builds, and rsyncs `dist/` to IONOS
3. Purges the Cloudflare cache
4. Cross-posts to dev.to and Hashnode with UTM tracking
5. Schedules future posts for automatic deployment at 08:30 London time

## Commands

| Command | Action |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Start dev server at `localhost:4321` |
| `npm run build` | Build production site to `./dist/` |
| `npm run preview` | Preview production build locally |
