// The shop's item catalog - client-side display copy. The actual prices
// that get charged live in schema.sql's purchase_item(), which does not
// trust a client-passed price; keep the two in sync by hand when editing.
export const SHOP_CATEGORIES = [
  { id: 'bg', label: 'Profile backgrounds', hint: "Shows behind your profile page's header." },
  { id: 'border', label: 'Avatar borders', hint: 'Shows around your avatar wherever it appears.' },
  { id: 'name', label: 'Nickname effects', hint: 'Styles your display name on your profile and in the navbar.' },
];

export const SHOP_ITEMS = [
  { id: 'bg-sunset', category: 'bg', label: 'Sunset', price: 50 },
  { id: 'bg-ocean', category: 'bg', label: 'Ocean', price: 50 },
  { id: 'bg-midnight', category: 'bg', label: 'Midnight', price: 75 },
  { id: 'bg-aurora', category: 'bg', label: 'Aurora', price: 150 },
  { id: 'bg-confetti', category: 'bg', label: 'Confetti', price: 200 },
  { id: 'bg-blocks', category: 'bg', label: 'Blocks', price: 100 },
  { id: 'bg-paper', category: 'bg', label: 'Paper', price: 40 },
  { id: 'bg-grid', category: 'bg', label: 'Blueprint', price: 55 },
  { id: 'bg-sunrise', category: 'bg', label: 'Sunrise', price: 60 },
  { id: 'bg-forest', category: 'bg', label: 'Deep Forest', price: 70 },
  { id: 'bg-terminal', category: 'bg', label: 'Terminal', price: 85 },
  { id: 'bg-halftone', category: 'bg', label: 'Halftone', price: 95 },
  { id: 'bg-topo', category: 'bg', label: 'Contours', price: 110 },
  { id: 'bg-vhs', category: 'bg', label: 'VHS', price: 130 },
  { id: 'bg-starfield', category: 'bg', label: 'Starfield', price: 160 },
  { id: 'bg-vaporwave', category: 'bg', label: 'Vaporwave', price: 175 },
  { id: 'bg-static', category: 'bg', label: 'Static', price: 190 },
  { id: 'bg-lava', category: 'bg', label: 'Lava Lamp', price: 220 },
  { id: 'bg-paws', category: 'bg', label: 'Paw Prints', price: 70 },
  { id: 'bg-beach', category: 'bg', label: 'Beach Day', price: 80 },
  { id: 'bg-snow', category: 'bg', label: 'Snowfall', price: 95 },

  { id: 'border-bronze', category: 'border', label: 'Bronze Ring', price: 30 },
  { id: 'border-silver', category: 'border', label: 'Silver Ring', price: 60 },
  { id: 'border-gold', category: 'border', label: 'Gold Ring', price: 120 },
  { id: 'border-neon', category: 'border', label: 'Neon Glow', price: 150 },
  { id: 'border-rainbow', category: 'border', label: 'Rainbow Ring', price: 200 },
  { id: 'border-flame', category: 'border', label: 'Blue Flame', price: 250 },
  { id: 'border-ink', category: 'border', label: 'Ink Ring', price: 20 },
  { id: 'border-dashed', category: 'border', label: 'Dashed', price: 45 },
  { id: 'border-double', category: 'border', label: 'Double Ring', price: 70 },
  { id: 'border-emerald', category: 'border', label: 'Emerald', price: 90 },
  { id: 'border-violet', category: 'border', label: 'Violet', price: 90 },
  { id: 'border-ember', category: 'border', label: 'Ember', price: 130 },
  { id: 'border-orbit', category: 'border', label: 'Orbit', price: 190 },
  { id: 'border-conic', category: 'border', label: 'Spectrum Spin', price: 210 },
  { id: 'border-glitch', category: 'border', label: 'Glitch', price: 230 },
  { id: 'border-halo', category: 'border', label: 'Halo', price: 260 },
  { id: 'border-collar', category: 'border', label: 'Dog Collar', price: 90 },
  { id: 'border-sun', category: 'border', label: 'Sunburst', price: 110 },
  { id: 'border-frost', category: 'border', label: 'Frost', price: 120 },

  { id: 'name-gradient', category: 'name', label: 'Gradient', price: 40 },
  { id: 'name-shadow', category: 'name', label: 'Pop Shadow', price: 60 },
  { id: 'name-glow', category: 'name', label: 'Cyan Glow', price: 80 },
  { id: 'name-rainbow', category: 'name', label: 'Rainbow', price: 150 },
  { id: 'name-sparkle', category: 'name', label: 'Sparkle', price: 180 },
  { id: 'name-oxygene', category: 'name', label: 'Oxygene 1', price: 120 },
  { id: 'name-caps', category: 'name', label: 'Small Caps', price: 25 },
  { id: 'name-underline', category: 'name', label: 'Underline', price: 35 },
  { id: 'name-marker', category: 'name', label: 'Highlighter', price: 55 },
  { id: 'name-emboss', category: 'name', label: 'Emboss', price: 65 },
  { id: 'name-outline', category: 'name', label: 'Outline', price: 75 },
  { id: 'name-terminal', category: 'name', label: 'Terminal', price: 90 },
  { id: 'name-ice', category: 'name', label: 'Ice', price: 130 },
  { id: 'name-fire', category: 'name', label: 'Fire', price: 140 },
  { id: 'name-gold', category: 'name', label: 'Gold Leaf', price: 170 },
  { id: 'name-glitch', category: 'name', label: 'Glitch', price: 200 },
  { id: 'name-woof', category: 'name', label: 'Woof', price: 80 },
  { id: 'name-tropic', category: 'name', label: 'Tropical', price: 90 },
];

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

export function findBundle(bundleId) {
  return SHOP_BUNDLES.find((bundle) => bundle.id === bundleId) || null;
}

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
// anything unrecognized) renders as no class at all.
export function effectClass(itemId) {
  return itemId && itemId !== 'none' && findItem(itemId) ? `shop-${itemId}` : '';
}
