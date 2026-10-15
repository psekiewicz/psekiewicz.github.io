// Reads the catalogs the site and the app carry (achievements, shop items,
// retired aliases) out of their source as text. Neither copy can be imported
// in Node: both pull in a Supabase client. Used by tests/parity.test.js and
// tests/integration/rls.test.js.

// [{ id, reward, check }] in file order. `check` is the body of the arrow
// function with whitespace collapsed, e.g. "s.totalLikes >= 100".
export function parseAchievements(source) {
  const start = source.indexOf('ACHIEVEMENTS');
  const body = source.slice(start, source.indexOf('\n];', start));
  const chunks = body.split(/(?=\bid: ')/).slice(1);
  return chunks.map((chunk) => ({
    id: chunk.match(/^id: '([a-z-]+)'/)[1],
    reward: Number(chunk.match(/reward: (\d+)/)[1]),
    check: chunk.match(/check: \(s\) => ([^\n]+?)\s*,?\s*(?:}|\n)/)[1].replace(/\s+/g, ' ').replace(/,$/, ''),
  }));
}

export function parseShopItems(source) {
  return [...source.matchAll(/\{ id: '([^']+)', category: '([^']+)', label: '([^']+)', price: (\d+) \}/g)].map((m) => ({
    id: m[1],
    category: m[2],
    label: m[3],
    price: Number(m[4]),
  }));
}

export function parseRetiredAliases(source) {
  const start = source.indexOf('RETIRED_ALIASES');
  const body = source.slice(start, source.indexOf('};', start));
  return Object.fromEntries([...body.matchAll(/'?([a-z0-9-]+)'?:\s*'([a-z0-9-]+)'/g)].map((m) => [m[1], m[2]]));
}
