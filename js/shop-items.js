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

  { id: 'border-bronze', category: 'border', label: 'Bronze Ring', price: 30 },
  { id: 'border-silver', category: 'border', label: 'Silver Ring', price: 60 },
  { id: 'border-gold', category: 'border', label: 'Gold Ring', price: 120 },
  { id: 'border-neon', category: 'border', label: 'Neon Glow', price: 150 },
  { id: 'border-rainbow', category: 'border', label: 'Rainbow Ring', price: 200 },

  { id: 'name-gradient', category: 'name', label: 'Gradient', price: 40 },
  { id: 'name-shadow', category: 'name', label: 'Pop Shadow', price: 60 },
  { id: 'name-glow', category: 'name', label: 'Cyan Glow', price: 80 },
  { id: 'name-rainbow', category: 'name', label: 'Rainbow', price: 150 },
  { id: 'name-sparkle', category: 'name', label: 'Sparkle', price: 180 },
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
