// The shop's item catalog - client-side display copy. The actual prices
// that get charged live in schema.sql's shop_item_defs and shop_bundle_defs
// tables, which purchase_item()/purchase_bundle() read without trusting
// anything the client passes; keep the two in sync by hand when editing
// (tests/integration checks them against each other).
export const SHOP_CATEGORIES = [
  { id: 'bg', label: 'Profile backgrounds', hint: "Shows behind your profile page's header." },
  { id: 'border', label: 'Avatar borders', hint: 'Shows around your avatar wherever it appears.' },
  { id: 'name', label: 'Nickname effects', hint: 'Styles your display name wherever it appears - comments, demos, news, the leaderboard.' },
];

export const SHOP_ITEMS = [
  { id: 'bg-paper', category: 'bg', label: 'Paper', price: 40 },
  { id: 'bg-sunset', category: 'bg', label: 'Sunset', price: 50 },
  { id: 'bg-paws', category: 'bg', label: 'Paw Prints', price: 70 },
  { id: 'bg-beach', category: 'bg', label: 'Beach Day', price: 80 },
  { id: 'bg-terminal', category: 'bg', label: 'Terminal', price: 85 },
  { id: 'bg-snow', category: 'bg', label: 'Snowfall', price: 95 },
  { id: 'bg-blocks', category: 'bg', label: 'Blocks', price: 100 },
  { id: 'bg-vhs', category: 'bg', label: 'VHS', price: 130 },
  { id: 'bg-aurora', category: 'bg', label: 'Aurora', price: 150 },

  { id: 'border-ink', category: 'border', label: 'Ink Ring', price: 20 },
  { id: 'border-double', category: 'border', label: 'Double Ring', price: 70 },
  { id: 'border-collar', category: 'border', label: 'Dog Collar', price: 90 },
  { id: 'border-sun', category: 'border', label: 'Sunburst', price: 110 },
  { id: 'border-gold', category: 'border', label: 'Gold Ring', price: 120 },
  { id: 'border-frost', category: 'border', label: 'Frost', price: 120 },
  { id: 'border-glitch', category: 'border', label: 'Glitch', price: 230 },
  { id: 'border-flame', category: 'border', label: 'Blue Flame', price: 250 },

  { id: 'name-caps', category: 'name', label: 'Small Caps', price: 25 },
  { id: 'name-gradient', category: 'name', label: 'Gradient', price: 40 },
  { id: 'name-woof', category: 'name', label: 'Woof', price: 80 },
  { id: 'name-tropic', category: 'name', label: 'Tropical', price: 90 },
  { id: 'name-terminal', category: 'name', label: 'Terminal', price: 90 },
  { id: 'name-oxygene', category: 'name', label: 'Oxygene 1', price: 120 },
  { id: 'name-ice', category: 'name', label: 'Ice', price: 130 },
  { id: 'name-gold', category: 'name', label: 'Gold Leaf', price: 170 },
  { id: 'name-glitch', category: 'name', label: 'Glitch', price: 200 },
];

// Items that used to be sold and are not any more. They stay in
// shop_item_defs and in people's owned_items, so nobody loses what they
// bought, but they are no longer listed - and the CSS for them is gone, so
// wherever one is equipped it is drawn as the closest current item instead.
export const RETIRED_ALIASES = {
  'bg-ocean': 'bg-beach',
  'bg-midnight': 'bg-snow',
  'bg-confetti': 'bg-sunset',
  'bg-grid': 'bg-terminal',
  'bg-sunrise': 'bg-sunset',
  'bg-forest': 'bg-terminal',
  'bg-halftone': 'bg-paper',
  'bg-topo': 'bg-paper',
  'bg-starfield': 'bg-snow',
  'bg-vaporwave': 'bg-vhs',
  'bg-static': 'bg-vhs',
  'bg-lava': 'bg-aurora',
  'border-bronze': 'border-double',
  'border-silver': 'border-double',
  'border-neon': 'border-glitch',
  'border-rainbow': 'border-gold',
  'border-dashed': 'border-ink',
  'border-emerald': 'border-gold',
  'border-violet': 'border-frost',
  'border-ember': 'border-flame',
  'border-orbit': 'border-frost',
  'border-conic': 'border-glitch',
  'border-halo': 'border-gold',
  'name-shadow': 'name-caps',
  'name-glow': 'name-ice',
  'name-rainbow': 'name-gradient',
  'name-sparkle': 'name-gold',
  'name-underline': 'name-caps',
  'name-marker': 'name-caps',
  'name-emboss': 'name-caps',
  'name-outline': 'name-caps',
  'name-fire': 'name-gold',
};

// Rarity follows the price, and the artwork follows the rarity: common
// items are still pictures, rare ones move a little, epic ones are the
// showpieces. Prices are the real ones in schema.sql, so this can't drift.
export const RARITIES = [
  { id: 'common', label: 'Common', max: 70 },
  { id: 'rare', label: 'Rare', max: 149 },
  { id: 'epic', label: 'Epic', max: Infinity },
];

export function rarityOf(item) {
  const price = typeof item === 'number' ? item : item?.price || 0;
  return RARITIES.find((rarity) => price <= rarity.max);
}

// Sets: one background, one border and one nickname effect that were
// drawn to go together, sold for less than the three separately.
//
// A set is just a list of item ids - it owns no cosmetics of its own, so
// buying one is exactly the same as buying its members one at a time, and
// an item can appear in more than one set. The price here is display copy:
// purchase_bundle() in schema.sql holds the real one, and works out what
// to charge from what you don't already own (see below).
export const SHOP_BUNDLES = [
  {
    id: 'set-puppy',
    label: 'Puppy Pack',
    blurb: 'Paw prints, a collar with a name tag, and a nose-print on your name.',
    price: 190,
    items: ['bg-paws', 'border-collar', 'name-woof'],
  },
  {
    id: 'set-summer',
    label: 'Summer Pack',
    blurb: 'Sea, sand and a sun that turns behind your avatar.',
    price: 220,
    items: ['bg-beach', 'border-sun', 'name-tropic'],
  },
  {
    id: 'set-winter',
    label: 'Winter Pack',
    blurb: 'Falling snow, a frozen ring and a name cut from ice.',
    price: 265,
    items: ['bg-snow', 'border-frost', 'name-ice'],
  },
  {
    id: 'set-terminal',
    label: 'Terminal Pack',
    blurb: 'Phosphor green, a plain ink ring and a blinking cursor.',
    price: 150,
    items: ['bg-terminal', 'border-ink', 'name-terminal'],
  },
  {
    id: 'set-retro',
    label: 'Retro Pack',
    blurb: 'Tracking bars, a tape-damaged ring and a name that will not sit still.',
    price: 430,
    items: ['bg-vhs', 'border-glitch', 'name-glitch'],
  },
  {
    id: 'set-paper',
    label: 'Paper Pack',
    blurb: 'The house style: paper, a double rule and small caps.',
    price: 105,
    items: ['bg-paper', 'border-double', 'name-caps'],
  },
];

// What the three items would cost bought separately - the number a set's
// price is compared against.
export function bundleListPrice(bundle) {
  return bundle.items.reduce((sum, id) => sum + (findItem(id)?.price || 0), 0);
}

// What a set costs *this* buyer. Members you already own are deducted
// proportionally, so a set is never a worse deal than buying what's left
// of it one at a time. purchase_bundle() computes the same figure from
// the same numbers server-side and charges that; this is only for display.
export function bundlePriceFor(bundle, ownedIds) {
  const list = bundleListPrice(bundle);
  if (list === 0) return 0;
  const missing = bundle.items
    .filter((id) => !ownedIds.has(id))
    .reduce((sum, id) => sum + (findItem(id)?.price || 0), 0);
  if (missing === 0) return 0;
  return Math.ceil((bundle.price * missing) / list);
}

// What the members you don't own yet would cost bought separately - the
// number the set's price is struck through against. For a set you own
// none of, this is the same as bundleListPrice().
export function bundleMissingListPrice(bundle, ownedIds) {
  return bundle.items
    .filter((id) => !ownedIds.has(id))
    .reduce((sum, id) => sum + (findItem(id)?.price || 0), 0);
}

export function itemsByCategory(category) {
  return SHOP_ITEMS.filter((item) => item.category === category);
}

export function findItem(itemId) {
  return SHOP_ITEMS.find((item) => item.id === itemId) || null;
}

// The CSS class an equipped/previewed item id maps to - 'none' (or
// anything unrecognized) renders as no class at all, and a retired item
// maps to its replacement.
export function effectClass(itemId) {
  if (!itemId || itemId === 'none') return '';
  const id = RETIRED_ALIASES[itemId] || itemId;
  return findItem(id) ? `shop-${id}` : '';
}
