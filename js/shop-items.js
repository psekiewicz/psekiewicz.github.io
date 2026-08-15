// The shop's item catalog — client-side display copy. The actual prices
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
];

export function itemsByCategory(category) {
  return SHOP_ITEMS.filter((item) => item.category === category);
}

export function findItem(itemId) {
  return SHOP_ITEMS.find((item) => item.id === itemId) || null;
}

// The CSS class an equipped/previewed item id maps to — 'none' (or
// anything unrecognized) renders as no class at all.
export function effectClass(itemId) {
  return itemId && itemId !== 'none' && findItem(itemId) ? `shop-${itemId}` : '';
}
