import type { WatchTone } from '@/lib/watches';

export type CardMeta = { list: number; rating: number; reviews: number; bought: string; badge?: string; stock?: number; specs: string[] };

export const cardMeta: Record<WatchTone, CardMeta> = {
  steel: { list: 14900, rating: 4.7, reviews: 1842, bought: '500+', badge: 'Best Seller', specs: ['41mm case', '200m water resistant', 'Automatic movement'] },
  black: { list: 16900, rating: 4.6, reviews: 963, bought: '200+', badge: 'Limited time deal', stock: 3, specs: ['42mm case', 'Sapphire crystal', 'Skeleton dial'] },
  gold: { list: 21500, rating: 4.8, reviews: 1204, bought: '300+', badge: 'Overall Pick', specs: ['40mm case', 'Chronograph', '100m water resistant'] },
  rosegold: { list: 18900, rating: 4.5, reviews: 712, bought: '100+', stock: 5, specs: ['38mm case', 'Leather strap', 'Quartz movement'] },
};
