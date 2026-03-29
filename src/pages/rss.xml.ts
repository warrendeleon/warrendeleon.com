import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPostsForLocale, getPostSlug } from '../utils/blogHelpers';

export async function GET(context: APIContext) {
  const now = new Date();
  const posts = (await getPostsForLocale('en')).filter(
    post => post.data.publishDate <= now,
  );

  return rss({
    title: 'Warren de Leon | Blog',
    description:
      'Writing about engineering leadership, React Native, and building great teams.',
    site: context.site!,
    items: posts.map(post => ({
      title: post.data.title,
      pubDate: post.data.publishDate,
      description: post.data.description,
      link: `/blog/${getPostSlug(post.id)}/`,
    })),
  });
}
