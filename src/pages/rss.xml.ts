import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context: any) {
  const now = new Date();
  const posts = (await getCollection('blog'))
    .filter(post => !post.data.draft && post.data.publishDate <= now)
    .sort((a, b) => b.data.publishDate.valueOf() - a.data.publishDate.valueOf());

  return rss({
    title: 'Warren de Leon',
    description: 'Articles on software engineering, team leadership, and mobile development.',
    site: context.site,
    items: posts.map(post => ({
      title: post.data.title,
      pubDate: post.data.publishDate,
      description: post.data.description,
      link: `/blog/${post.id}/`,
    })),
  });
}
