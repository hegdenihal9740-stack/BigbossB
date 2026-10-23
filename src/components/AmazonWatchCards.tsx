import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ScanLine, Search, Star } from 'lucide-react';
import { toast } from 'sonner';
import { cart, prices } from '@/lib/cart';
import { watches, type WatchTone } from '@/lib/watches';
import { isBuiltIn } from '@/lib/products';
import { cardMeta as meta } from '@/lib/watch-meta';

const usd = (n: number) => n.toLocaleString('en-IN');

function Stars({ value }: { value: number }) {
  return (
    <span className="az-stars" aria-label={`${value} out of 5 stars`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span key={i} className="az-star">
            <Star size={15} className="az-star-bg" />
            <span style={{ width: `${fill * 100}%` }}><Star size={15} fill="currentColor" /></span>
          </span>
        );
      })}
    </span>
  );
}

export function WatchProductCard({ tone }: { tone: WatchTone }) {
  const w = watches.find((x) => x.id === tone);
  if (!w) return null;
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const m = meta[w.id];
  const price = prices[w.id];
  const off = Math.round((1 - price / m.list) * 100);
  return (
    <article className="az-card">
      {m.badge && <span className="az-badge">{m.badge}</span>}
      <Link to="/shop/$watchId" params={{ watchId: w.id }} className="az-img"><img src={w.image} alt={w.name} loading="lazy" /></Link>
      <div className="az-body">
        <p className="az-eyebrow">BIG-B · {w.finish}</p>
        <Link to="/shop/$watchId" params={{ watchId: w.id }} className="az-title">{w.name}</Link>
        <p className="az-specs">{m.specs.join(' · ')}</p>
        <div className="az-price-row">
          <span className="az-price">₹{usd(price)}</span>
          <s className="az-muted">₹{usd(m.list)}</s>
          <span className="az-off">−{off}%</span>
        </div>
        <div className="az-rating"><Stars value={m.rating} /><span>{m.rating}</span><span className="az-muted">({usd(m.reviews)})</span></div>
        <p className="az-small az-muted">Delivered by {tomorrow}{m.stock ? ` · only ${m.stock} left` : ''}</p>
        <div className="az-links">
          {isBuiltIn(w.id) && <Link to="/watches/$watchId" params={{ watchId: w.id }} search={{ tryon: true }} className="az-tryon"><ScanLine size={14} /> Try on</Link>}
          <Link to="/shop/$watchId" params={{ watchId: w.id }} className="az-more">Details</Link>
        </div>
        <button type="button" className="az-add" onClick={() => { cart.add(w.id); toast.success(`${w.name} added to cart`); }}>Add to cart</button>
      </div>
    </article>
  );
}

const filters: { id: 'all' | WatchTone; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'steel', label: 'Stainless Steel' }, { id: 'black', label: 'Midnight Black' },
  { id: 'gold', label: 'Classic Gold' }, { id: 'rosegold', label: 'Rose Gold' },
];
type Sort = 'popular' | 'low' | 'high' | 'rating' | 'new';

export function AmazonWatchCards() {
  const [filter, setFilter] = useState<'all' | WatchTone>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('popular');
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const found = watches.map((w, i) => ({ w, i })).filter(({ w }) => (filter === 'all' || w.id === filter)
      && (!term || [w.name, w.finish, ...w.details, ...meta[w.id].specs].join(' ').toLowerCase().includes(term)));
    const by: Record<Sort, (a: typeof found[number], b: typeof found[number]) => number> = {
      popular: (a, b) => meta[b.w.id].reviews - meta[a.w.id].reviews,
      low: (a, b) => prices[a.w.id] - prices[b.w.id],
      high: (a, b) => prices[b.w.id] - prices[a.w.id],
      rating: (a, b) => meta[b.w.id].rating - meta[a.w.id].rating,
      new: (a, b) => b.i - a.i,
    };
    return found.sort(by[sort]).map(({ w }) => w);
  }, [filter, q, sort]);
  return (
    <section className="az-section" aria-labelledby="az-title">
      <h2 id="az-title">Shop the collection</h2>
      <div className="az-tools">
        <label className="az-search"><Search size={16} /><input type="search" placeholder="Search name, finish, features…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search watches" /></label>
        <select className="az-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by">
          <option value="popular">Popularity</option><option value="low">Price: Low to High</option>
          <option value="high">Price: High to Low</option><option value="rating">Top rated</option><option value="new">Newest</option>
        </select>
      </div>
      <div className="az-chips" role="radiogroup" aria-label="Finish">
        {filters.map((f) => <button key={f.id} type="button" role="radio" aria-checked={filter === f.id} className={`az-chip ${filter === f.id ? 'is-on' : ''}`} onClick={() => setFilter(f.id)}>{f.label}</button>)}
      </div>
      {list.length ? <div className="az-grid">{list.map((w) => <WatchProductCard key={w.id} tone={w.id} />)}</div>
        : <p className="az-muted">No watches match. <button type="button" className="az-chip" onClick={() => { setQ(''); setFilter('all'); }}>Clear filters</button></p>}
    </section>
  );
}
