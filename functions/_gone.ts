// Retired WordPress-era paths answer 410 Gone rather than 404.
//
// A 404 tells a crawler "not here right now", so Google keeps the URL in its
// crawl schedule and retries it for months. A 410 says the URL is permanently
// gone, which Google acts on sooner and retries far less. The Search Console
// "Not found" bucket counts both the same, so this shortens the crawling, not
// the report.
//
// Lives here rather than in a Cloudflare custom rule because the zone's
// firewall phase is capped at five rules and all five are in use. Typed as a
// plain handler rather than `PagesFunction` so the repo does not take on
// @cloudflare/workers-types for eight one-line files.
export const gone = (): Response =>
  new Response(
    'Gone. This URL belonged to the retired WordPress site and will not return.\n',
    {
      status: 410,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'public, max-age=86400',
      },
    },
  );
