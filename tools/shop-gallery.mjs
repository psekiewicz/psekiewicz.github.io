// Writes .gallery.html at the repo root: every shop item, the frames at
// navbar/feed/profile sizes, each set on a profile header, and a retired
// item. Serve the repo (npx http-server .) and open /.gallery.html to look at
// the artwork under the real stylesheet, in light and dark.
import { SHOP_ITEMS, SHOP_BUNDLES, effectClass, rarityOf, RETIRED_ALIASES } from '../js/shop-items.js';
import fs from 'fs';
const prev = (i) => {
  const c = effectClass(i.id);
  return i.category==='bg' ? `<div class="shop-item-preview ${c}"></div>`
   : i.category==='border' ? `<div class="shop-item-preview shop-item-preview-avatar ${c}">P</div>`
   : `<div class="shop-item-preview shop-item-preview-name"><span class="${c}">Peter</span></div>`;
};
const card = (i) => `<div class="shop-item-card" style="width:150px;padding:14px 10px">${prev(i)}<span class="shop-item-name">${i.label}</span><span class="shop-rarity shop-rarity-${rarityOf(i).id}">${rarityOf(i).label}</span></div>`;
const cats = ['bg','border','name'].map(c=>`<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px">${SHOP_ITEMS.filter(i=>i.category===c).map(card).join('')}</div>`).join('');
const sizes = SHOP_ITEMS.filter(i=>i.category==='border').map(i=>`<div style="display:flex;align-items:center;gap:6px;padding:14px 18px"><span class="avatar ${effectClass(i.id)}" style="width:26px;height:26px">P</span><span class="avatar ${effectClass(i.id)}" style="width:42px;height:42px">P</span><span class="profile-avatar ${effectClass(i.id)}" style="width:96px;height:96px">P</span></div>`).join('');
const header = (bg,bd,nm) => `<div class="profile-header has-profile-bg ${effectClass(bg)}" style="display:flex;gap:18px;align-items:center;width:560px"><div class="profile-avatar ${effectClass(bd)}" style="width:80px;height:80px">P</div><div class="profile-info"><h1 class="${effectClass(nm)}" style="margin:0;display:inline-block">Peter Sek</h1><p>Builder of small things</p><div class="profile-stats"><div class="profile-stat"><div class="num">12</div><div class="label">projects</div></div></div></div></div>`;
const sets = SHOP_BUNDLES.map(b=>header(...b.items)).join('<div style="height:10px"></div>');
fs.writeFileSync(new URL('../.gallery.html', import.meta.url), `<!doctype html><meta charset="utf-8"><link rel=stylesheet href="/css/style.css"><body style="padding:18px;background:var(--color-bg)">${cats}<div style="display:flex;flex-wrap:wrap">${sizes}</div><h3>Sets</h3>${sets}<h3>Retired alias</h3>${header('bg-lava','border-neon','name-sparkle')}`);
