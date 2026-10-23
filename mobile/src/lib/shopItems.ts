// The shop's item catalog - display copy only. The prices that actually get
// charged live in schema.sql's purchase_item()/purchase_bundle(), which do not
// trust anything the client passes; keep the two in sync by hand when editing,
// exactly as js/shop-items.js says.

export type ShopItem = { id: string; category: string; label: string; price: number };

export const SHOP_CATEGORIES = [
  { id: 'bg', label: 'Profile backgrounds', hint: "Shows behind your profile page's header." },
  { id: 'border', label: 'Avatar borders', hint: 'Shows around your avatar wherever it appears.' },
  { id: 'name', label: 'Nickname effects', hint: 'Styles your display name on your profile.' },
];

export const SHOP_ITEMS: ShopItem[] = [
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
export const RETIRED_ALIASES: Record<string, string> = {
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
export const RARITIES: { id: 'common' | 'rare' | 'epic'; label: string; max: number }[] = [
  { id: 'common', label: 'Common', max: 70 },
  { id: 'rare', label: 'Rare', max: 149 },
  { id: 'epic', label: 'Epic', max: Infinity },
];

export function rarityOf(item: ShopItem | number | null) {
  const price = typeof item === 'number' ? item : item?.price || 0;
  return RARITIES.find((rarity) => price <= rarity.max)!;
}

// Sets: one background, one border and one nickname effect drawn to go
// together, sold for less than the three separately. A set owns no cosmetics
// of its own - buying one is the same as buying its members individually.
export type ShopBundle = {
  id: string;
  label: string;
  blurb: string;
  price: number;
  items: string[];
};

export const SHOP_BUNDLES: ShopBundle[] = [
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

export function findItem(itemId: string) {
  return SHOP_ITEMS.find((item) => item.id === itemId) || null;
}

export function itemsByCategory(category: string) {
  return SHOP_ITEMS.filter((item) => item.category === category);
}

// What the three items would cost bought separately.
export function bundleListPrice(bundle: ShopBundle) {
  return bundle.items.reduce((sum, id) => sum + (findItem(id)?.price || 0), 0);
}

// What a set costs *this* buyer. Members already owned are deducted
// proportionally, so a set is never a worse deal than buying what's left of it
// one at a time. purchase_bundle() computes the same figure server-side and
// charges that; this is only for display.
export function bundlePriceFor(bundle: ShopBundle, ownedIds: Set<string>) {
  const list = bundleListPrice(bundle);
  if (list === 0) return 0;
  const missing = bundle.items
    .filter((id) => !ownedIds.has(id))
    .reduce((sum, id) => sum + (findItem(id)?.price || 0), 0);
  if (missing === 0) return 0;
  return Math.ceil((bundle.price * missing) / list);
}

export function bundleMissingListPrice(bundle: ShopBundle, ownedIds: Set<string>) {
  return bundle.items
    .filter((id) => !ownedIds.has(id))
    .reduce((sum, id) => sum + (findItem(id)?.price || 0), 0);
}
