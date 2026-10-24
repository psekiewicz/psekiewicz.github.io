// Which app screen shows the same thing as a page of the website - so a
// website link tapped inside the app opens that screen (lib/links.ts). Kept
// free of imports so tests/app-links.test.js can run it as it is.

const SITE_HOSTS = new Set(['psekiewicz.github.io', 'www.psekiewicz.github.io']);

export type Route = { name: string; params?: Record<string, string> };

/** The app screen for a website URL, or null when the app has none. */
export function siteRoute(url: string): Route | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!SITE_HOSTS.has(u.hostname)) return null;
  const page = u.pathname.replace(/\/+$/, '').replace(/\.html$/, '').replace(/\/index$/, '') || '/';
  const id = u.searchParams.get('id');
  switch (page) {
    case '/':
    case '/demos':
    case '/projects':
      return { name: 'Tabs', params: { screen: 'Demos' } };
    case '/project':
      return id ? { name: 'ProjectDetail', params: { projectId: id } } : null;
    case '/profile': {
      const user = u.searchParams.get('user');
      return user ? { name: 'UserProfile', params: { userId: user } } : { name: 'Tabs', params: { screen: 'Profile' } };
    }
    case '/news':
    case '/weekly':
      return { name: 'Tabs', params: { screen: 'News' } };
    case '/newsletter':
      return id ? { name: 'Newsletter', params: { newsletterId: id } } : { name: 'Tabs', params: { screen: 'News' } };
    case '/article':
    case '/issue':
      return id ? { name: 'Article', params: { articleId: id } } : { name: 'Tabs', params: { screen: 'News' } };
    case '/leaderboard':
      return { name: 'Tabs', params: { screen: 'Ranks' } };
    case '/dashboard':
      return { name: 'YourWork' };
    case '/shop':
      return { name: 'Shop' };
    case '/settings':
      return { name: 'Settings' };
    default:
      return null;
  }
}

