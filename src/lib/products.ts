import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { watches, watchCloseups, type WatchTone } from '@/lib/watches';
import { prices } from '@/lib/cart';
import { cardMeta } from '@/lib/watch-meta';

export type ProductRow = Database['public']['Tables']['products']['Row'];
export const BUILT_IN = ['steel', 'black', 'gold', 'rosegold'];
export const isBuiltIn = (id: string) => BUILT_IN.includes(id);

const url = import.meta.env['VITE_SUPABASE_URL'] as string;
const key = import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] as string;
const pub = () => createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false, storage: undefined } });

/** Merges seller-added watches into the shared catalog so every page shows them. */
export function applyProducts(rows: ProductRow[]) {
  const list = watches as unknown as Record<string, unknown>[];
  for (let i = list.length - 1; i >= 0; i--) if (!isBuiltIn(String(list[i]!['id']))) list.splice(i, 1);
  for (const r of rows) {
    if (isBuiltIn(r.id) || !r.active) continue;
    const id = r.id as WatchTone;
    list.push({ id: r.id, name: r.name, finish: r.finish, image: r.image_url, description: r.description, details: r.details.length ? r.details : [r.finish] });
    (prices as Record<string, number>)[id] = r.price;
    (cardMeta as Record<string, unknown>)[id] = { list: Math.max(r.list_price, r.price), rating: 4.5, reviews: 0, bought: 'New', badge: 'New arrival', specs: r.details.slice(0, 3) };
    (watchCloseups as Record<string, unknown>)[id] = [0, 1, 2].map((n) => ({ title: r.details[n] ?? r.name, description: r.description }));
  }
}

let cache: { at: number; p: Promise<void> } | null = null;
export function ensureProducts(force = false) {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache.p;
  const p = (async () => {
    try {
      const { data } = await pub().from('products').select('*').eq('active', true).order('created_at');
      if (data) applyProducts(data);
    } catch { /* keep built-in catalog */ }
  })();
  cache = { at: Date.now(), p };
  return p;
}

/** Shrinks an uploaded photo to a compact JPEG data URL stored with the product. */
export function photoToDataUrl(file: File, max = 900): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      const ctx = c.getContext('2d');
      if (!ctx) return rej(new Error('no canvas'));
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => rej(new Error('Could not read that image'));
    img.src = URL.createObjectURL(file);
  });
}

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
