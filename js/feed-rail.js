import { escapeHtml, avatarHtml } from './utils.js';
import { icon } from './icons.js';
import { effectClass } from './shop-items.js';

// The right-hand column beside a feed: search, people worth following,
// what's being tagged, and the app. Everything in it is derived from data the
// page either already has (the projects it fetched) or can get in one query
// (the top of the leaderboard) - no new tables.

// Tags counted across the projects the feed already loaded, most used first.
export function trendingTags(projects, limit = 6) {
  const counts = new Map();
  for (const p of projects) {
    for (const tag of p.tags) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

function whoToFollowHtml(people, followingIds, signedIn) {
  if (people.length === 0) return '';
  return `
    <section class="rail-card" aria-labelledby="rail-follow-title">
      <h2 id="rail-follow-title">Who to follow</h2>
      ${people
        .map(({ profile, xp }) => {
          const follows = followingIds.has(profile.id);
          return `
            <div class="rail-row">
              <a href="/profile.html?user=${encodeURIComponent(profile.id)}" tabindex="-1" aria-hidden="true">
                ${avatarHtml(profile.avatarUrl, profile.displayName, effectClass(profile.equippedBorder))}
              </a>
              <a class="rail-row-text" href="/profile.html?user=${encodeURIComponent(profile.id)}">
                <span class="rail-row-title">${escapeHtml(profile.displayName)}</span>
                <span class="rail-row-sub">${xp.toLocaleString()} XP</span>
              </a>
              ${
                signedIn
                  ? `<button class="btn btn-sm ${follows ? 'btn-secondary' : 'btn-primary'}" type="button" data-follow="${escapeHtml(profile.id)}" aria-pressed="${follows}">${follows ? 'Following' : 'Follow'}</button>`
                  : `<a class="btn btn-sm btn-primary" href="/login.html?next=${encodeURIComponent('/index.html')}">Follow</a>`
              }
            </div>
          `;
        })
        .join('')}
      <a class="rail-more" href="/leaderboard.html">Show more</a>
    </section>
  `;
}

function trendingHtml(tags) {
  if (tags.length === 0) return '';
  return `
    <section class="rail-card" aria-labelledby="rail-trend-title">
      <h2 id="rail-trend-title">Trending tags</h2>
      ${tags
        .map(
          ([tag, count]) => `
            <a class="rail-row" href="/projects.html?tag=${encodeURIComponent(tag)}">
              <span class="rail-row-text">
                <span class="rail-row-title">#${escapeHtml(tag)}</span>
                <span class="rail-row-sub">${count} ${count === 1 ? 'post' : 'posts'}</span>
              </span>
            </a>
          `
        )
        .join('')}
    </section>
  `;
}

// Paints the rail into `el`. Search and the app card appear immediately; the
// people list follows once the leaderboard query returns.
export async function renderRail(el, { user, projects, followingIds = new Set() }) {
  const tags = trendingTags(projects);
  const base = (people = []) => `
    <form class="rail-search" action="/projects.html" role="search">
      ${icon('search', { size: 18 })}
      <input type="search" name="q" placeholder="Search Showcase" aria-label="Search Showcase" />
    </form>
    ${whoToFollowHtml(people, followingIds, Boolean(user))}
    ${trendingHtml(tags)}
    <section class="rail-app">
      <strong>Showcase for Android</strong>
      <p>Same account, same feed - plus sharing straight from any app.</p>
      <a class="btn btn-sm btn-primary" href="/download/">${icon('download', { size: 15 })} Get the app</a>
    </section>
    <nav class="rail-foot" aria-label="Site">
      <a href="/leaderboard.html">Leaderboard</a>
      <a href="/shop">Shop</a>
      <a href="/download/">Android app</a>
      <span>© ${new Date().getFullYear()} Showcase</span>
    </nav>
  `;
  el.innerHTML = base();

  try {
    const [{ getTopByXp }, { getProfilesByIds }] = await Promise.all([
      import('./reputation-data.js'),
      import('./profiles-data.js'),
    ]);
    const top = await getTopByXp(20);
    const candidates = top.filter((r) => r.userId !== (user && user.id) && !followingIds.has(r.userId)).slice(0, 3);
    const profiles = await getProfilesByIds(candidates.map((r) => r.userId));
    const people = candidates
      .map((r) => ({ profile: profiles.get(r.userId), xp: r.xp }))
      .filter((p) => p.profile);
    el.innerHTML = base(people);
  } catch {
    // The rail is a garnish - if the leaderboard can't load, the rest stays.
  }

  if (el.dataset.followBound) return;
  el.dataset.followBound = '1';
  el.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-follow]');
    if (!btn || !user) return;
    const targetId = btn.dataset.follow;
    const wasFollowing = btn.getAttribute('aria-pressed') === 'true';
    btn.disabled = true;
    try {
      const { followUser, unfollowUser } = await import('./follows-data.js');
      await (wasFollowing ? unfollowUser(user.id, targetId) : followUser(user.id, targetId));
      if (wasFollowing) followingIds.delete(targetId);
      else followingIds.add(targetId);
      btn.setAttribute('aria-pressed', String(!wasFollowing));
      btn.textContent = wasFollowing ? 'Follow' : 'Following';
      btn.classList.toggle('btn-primary', wasFollowing);
      btn.classList.toggle('btn-secondary', !wasFollowing);
    } catch (err) {
      const { showToast } = await import('./toast.js');
      showToast({ title: 'Could not update follow', body: err.message, iconName: 'x', variant: 'error' });
    } finally {
      btn.disabled = false;
    }
  });
}
