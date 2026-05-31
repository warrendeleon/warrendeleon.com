import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    // English posts carry the publish date. Translations omit it and inherit the
    // date of the English post with the same slug (filled in getPostsForLocale),
    // so a translation always publishes exactly when its English master does.
    publishDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    locale: z.enum(['en', 'es', 'ca', 'tl']).default('en'),
    draft: z.boolean().default(false),
    heroImage: z.string().optional(),
    heroAlt: z.string().optional(),
    
    
    campaign: z.string(),
    relatedPosts: z.array(z.string()).optional(),
  }),
});

export const collections = { blog };
