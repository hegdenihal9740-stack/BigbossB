import { ShoppingCart, Zap, Star, Tag, ShieldCheck, RotateCcw, Truck, MapPin, Heart, MessageCircle } from 'lucide-react';
import { useWishlist, wishlist } from '@/lib/wishlist';
import { useStock, stockLabel } from '@/lib/inventory';
import { toast } from 'sonner';
import { useEffect, useRef, useState } from 'react';
import { whatsappLink } from '@/lib/whatsapp';
import { Reviews } from '@/components/Reviews';
import { useCustomer } from '@/components/CustomerAccounts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import steelJpg from '@/assets/watch-steel.jpg';
import blackJpg from '@/assets/watch-black.jpg';
import goldJpg from '@/assets/watch-gold.jpg';
import roseJpg from '@/assets/watch-rosegold.jpg';
import steelTry from '@/assets/try-on-steel.png';
import blackTry from '@/assets/try-on-black.png';
import goldTry from '@/assets/try-on-gold.png';
import roseTry from '@/assets/try-on-rosegold.png';
import steelHand from '@/assets/hand-steel.jpg';
import blackHand from '@/assets/hand-black.jpg';
import goldHand from '@/assets/hand-gold.jpg';
import roseHand from '@/assets/hand-rosegold.jpg';
import steelLife from '@/assets/lifestyle-steel.jpg';
import blackLife from '@/assets/lifestyle-black.jpg';
import goldLife from '@/assets/lifestyle-gold.jpg';
import roseLife from '@/assets/lifestyle-rosegold.jpg';
import { cardMeta } from '@/lib/watch-meta';
const FEAT = 'feat:';
const isFeat = (s?: string) => !!s && s.startsWith(FEAT);
const life: Record<string, string> = { steel: steelLife, black: blackLife, gold: goldLife, rosegold: roseLife };
function FeatureCard({ img, labels }: { img: string; labels: string[] }) {
  const crops = ['50% 8%', '88% 50%', '50% 50%'];
  return <div className="fk-feat"><div className="fk-feat-disc" /><img className="fk-feat-main" src={img} alt="" />
    <ul className="fk-feat-list">{labels.slice(0, 3).map((l, i) => <li key={l}><span className="fk-feat-circle" style={{ backgroundImage: `url(${img})`, backgroundPosition: crops[i] }} /><span>{l}</span></li>)}</ul></div>;
}
const dialSizes = ['38 mm', '40 mm', '42 mm', '44 mm'];

const extra: Record<WatchTone, string[]> = {
  steel: [steelHand, steelJpg, steelTry], black: [blackHand, blackJpg, blackTry], gold: [goldHand, goldJpg, goldTry], rosegold: [roseHand, roseJpg, roseTry],
};
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cart, prices } from '@/lib/cart';
import { watches, type WatchTone } from '@/lib/watches';

const usd = (n: number) => n.toLocaleString('en-IN');

export function FlipkartDetails({
  tone, open, onOpenChange, asPage = false, onBuy,
}: { tone: WatchTone; open: boolean; onOpenChange: (o: boolean) => void; asPage?: boolean; onBuy?: (id: WatchTone) => void }) {
  const { user: customer } = useCustomer();
  const Title = asPage ? 'h1' : DialogTitle;
  const Desc = asPage ? 'p' : DialogDescription;
  const [pick, setPick] = useState<WatchTone | null>(null);
  const active = pick ?? tone;
  const m = cardMeta[active];
  const w = watches.find((x) => x.id === active)!;
  const stock = useStock();
  const left = stock?.[active];
  const sold = left !== undefined && left <= 0;
  const price = prices[w.id];
  const wish = useWishlist();
  const imgs = [w.image, ...(m.specs.length ? [`${FEAT}${w.id}`] : []), ...(life[w.id] ? [life[w.id]!] : []), ...(extra[w.id] ?? [])];
  const feat = <FeatureCard img={w.image} labels={m.specs} />;
  const [dial, setDial] = useState('42 mm');
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState(false);
  const off = Math.round((1 - price / m.list) * 100);
  const deliveryDate = new Date(Date.now() + 3 * 86400000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const [pincode, setPincode] = useState('');
  const [pinMsg, setPinMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const checkPincode = () => {
    if (pincode.length !== 6) { setPinMsg({ ok: false, text: 'Please enter a valid 6-digit pincode' }); return; }
    const days = 2 + (Number(pincode[5]) % 4);
    const date = new Date(Date.now() + days * 86400000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    setPinMsg({ ok: true, text: `Delivery to ${pincode} by ${date} · Free delivery available` });
  };
  const table: [string, string][] = [
    ['Model Name', `BIG-B ${w.name}`],
    ['Dial Color', w.details[0]],
    ['Strap / Case Finish', w.finish],
    ['Dial Size', dial],
    ['Case Thickness', '11.5 mm'],
    ['Strap Width', '20 mm'],
    ['Water Resistance', '100 m'],
    ['Display Type', 'Analog'],
    ['Ideal For', 'Men'],
    ...m.specs.map((s, i) => [['Case Size', 'Feature', 'Movement'][i] ?? 'Feature', s] as [string, string]),
    ['Warranty', '2 Years manufacturer warranty'],
  ];
  useEffect(() => { if (!open) setPick(null); }, [open]);
  useEffect(() => { setIdx(0); setZoom(false); sliderRef.current?.scrollTo({ left: 0 }); }, [active]);
  const sliderRef = useRef<HTMLDivElement>(null);
  const slideTo = (i: number) => {
    const el = sliderRef.current; if (!el) return;
    const n = (i + imgs.length) % imgs.length;
    el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' });
    setIdx(n);
    setZoom(false);
  };
  const onSlide = () => {
    const el = sliderRef.current; if (!el) return;
    const n = Math.round(el.scrollLeft / el.clientWidth);
    if (n !== idx) setIdx(n);
  };
  const press = useRef({ x: 0, y: 0, moved: false });
  const toggleImageZoom = (i: number) => {
    if (press.current.moved) return;
    if (i !== idx) {
      slideTo(i);
      return;
    }
    setZoom((current) => !current);
  };
  const actionsRef = useRef<HTMLDivElement>(null);

  const [showSticky, setShowSticky] = useState(false);
  useEffect(() => {
    const el = actionsRef.current;
    if (!el || !asPage) return;
    const io = new IntersectionObserver(([e]) => setShowSticky(!e!.isIntersecting && e!.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, [asPage]);
  const buyNow = () => {
    if (!customer) {
      sessionStorage.setItem('pf-after-login', `/checkout?item=${encodeURIComponent(w.id)}`);
      toast.info('Please log in to continue with your purchase');
      window.location.assign('/auth');
      return;
    }
    if (onBuy) { onBuy(w.id); return; } cart.add(w.id); toast.success('Proceeding to checkout'); onOpenChange(false);
  };
  const addCart = () => { cart.add(w.id); toast.success(`${w.name} (${dial}) added to cart`); };
  return (
    <>
    {(() => { const body = (
        <div className="fk-grid">
          <div className="fk-left">
            <span className="fk-index">{String(idx + 1).padStart(2, '0')} / {String(imgs.length).padStart(2, '0')}</span>
            <button type="button" className={`fk-wish ${wish.includes(w.id) ? 'is-on' : ''}`} aria-label="Add to wishlist" onClick={() => toast.success(wishlist.toggle(w.id) ? 'Added to wishlist' : 'Removed from wishlist')}><Heart size={18} fill={wish.includes(w.id) ? 'currentColor' : 'none'} /></button>
            <div className="fk-slider-wrap"
              onPointerDown={(e) => { press.current = { x: e.clientX, y: e.clientY, moved: false }; }}
              onPointerMove={(e) => { if (Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 10) press.current.moved = true; }}
            >
              <div className="fk-slider" ref={sliderRef} onScroll={onSlide}>
                {imgs.map((src, i) => isFeat(src)
                  ? <div key={src} className="fk-imgbox fk-slide is-feat">{feat}</div>
                  : <div key={src} className={`fk-imgbox fk-slide is-zoomable ${i === idx ? 'is-active' : ''} ${i === idx && zoom ? 'is-zoomed' : ''}`} onClick={() => toggleImageZoom(i)}><img src={src} alt={w.name} draggable={false} /></div>)}

              </div>
              <button type="button" className="fk-slide-nav is-prev" onClick={() => slideTo(idx - 1)} aria-label="Previous image"><ChevronLeft size={20} /></button>
              <button type="button" className="fk-slide-nav is-next" onClick={() => slideTo(idx + 1)} aria-label="Next image"><ChevronRight size={20} /></button>
              <div className="fk-dots">{imgs.map((src, i) => <span key={src} className={i === idx ? 'is-on' : ''} />)}</div>
            </div>
            <div className="fk-thumbs">{imgs.map((src, i) => (
              <button type="button" key={src} className={`fk-thumb ${i === idx ? 'is-active' : ''}`} onClick={() => slideTo(i)}>{isFeat(src) ? <span className="fk-thumb-vid">Key</span> : <img src={src} alt="" />}</button>
            ))}</div>
          </div>
          <div className="fk-right">
            <p className="fk-brand">BIG-B · {w.finish}</p>
            <Title className="fk-title">{w.name}</Title>
            <p className="fk-subtitle">{w.details[0]} · analog automatic</p>
            <div className="fk-rating-row">
              <span className="fk-rating-chip">{m.rating} <Star size={11} fill="currentColor" /></span>
              <span className="fk-muted">{usd(m.reviews)} ratings &amp; reviews</span>
            </div>
            <p className="fk-special">Special Price</p>
            <div className="fk-price-row">
              <span className="fk-price">₹{usd(price)}</span>
              <s className="fk-muted">₹{usd(m.list)}</s>
              <span className="fk-off">{off}% off</span>
            </div>
            <div className="fk-delivery">
              <div className="fk-pincode">
                <MapPin size={16} />
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Enter delivery pincode"
                  value={pincode}
                  onChange={(e) => { setPincode(e.target.value.replace(/\D/g, '')); setPinMsg(null); }}
                  aria-label="Delivery pincode"
                />
                <button type="button" onClick={checkPincode}>Check</button>
              </div>
              {pinMsg && <p className={`fk-pin-msg ${pinMsg.ok ? 'is-ok' : 'is-err'}`}>{pinMsg.text}</p>}
              <div className="fk-delivery-row"><Truck size={16} /><span>Delivery by <b>{deliveryDate}</b> <span className="fk-delivery-free">| Free</span></span></div>
              <div className="fk-delivery-row"><RotateCcw size={16} /><span><b>7 days</b> Replacement Policy</span></div>
              <div className="fk-delivery-row"><ShieldCheck size={16} /><span><b>2 Year</b> Manufacturer Warranty</span></div>
            </div>
            <div className="fk-section">
              <h4>Case size <span className="fk-muted">{dial}</span></h4>
              <div className="fk-sizes">{dialSizes.map((d) => (
                <button type="button" key={d} className={`fk-size ${d === dial ? 'is-active' : ''}`} onClick={() => setDial(d)}>{d.replace(' mm', '')}</button>
              ))}</div>
            </div>
            {left !== undefined && <p className={sold ? 'fk-pin-msg is-err' : left <= 3 ? 'fk-pin-msg is-err' : 'fk-pin-msg is-ok'}>{stockLabel(left)}</p>}
            <div className="fk-actions" ref={actionsRef}>
              <button type="button" className="fk-buy" disabled={sold} onClick={buyNow}><Zap size={16} /> Buy now</button>
              <button type="button" className="fk-cart" disabled={sold} onClick={addCart}><ShoppingCart size={16} /> Add to cart</button>
            </div>
            <a className="fk-wa" href={whatsappLink(`Hi! I'm interested in the BIG-B ${w.name} (₹${usd(price)}, ${dial}). Can you share live photos and the delivery timeline?`)} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} /> Ask or order on WhatsApp</a>
            {asPage && showSticky && !sold && <div className="fk-sticky">
              <span className="fk-sticky-price"><b>₹{usd(price)}</b><small>{off}% off · Free delivery</small></span>
              <button type="button" className="fk-cart" onClick={addCart}>Add to cart</button>
              <button type="button" className="fk-buy" onClick={buyNow}>Buy now</button>
            </div>}
            <div className="fk-trust">
              <div className="fk-trust-card t-green"><Truck size={22} /><b>Free Delivery</b><span>By {deliveryDate}</span></div>
              <div className="fk-trust-card t-blue"><RotateCcw size={22} /><b>7 Days</b><span>Easy replacement</span></div>
              <div className="fk-trust-card t-gold"><ShieldCheck size={22} /><b>2 Year</b><span>Warranty</span></div>
            </div>
            <div className="fk-assure"><ShieldCheck size={16} /> 100% Genuine · Secure payments · Cash on delivery</div>
            <div className="fk-section">
              <h4>The story</h4>
              <Desc className="fk-desc">{w.description}</Desc>
            </div>
            <div className="fk-section">
              <h4>Highlights</h4>
              <ul className="fk-highlights">{[...w.details, ...m.specs].map((d) => <li key={d}>{d}</li>)}</ul>
            </div>
            <div className="fk-section">
              <h4>Privileges</h4>
              <ul className="fk-offers">
                <li><Tag size={14} /> 5% cashback on credit cards</li>
                <li><Tag size={14} /> Complimentary engraving this week</li>
              </ul>
            </div>
            <div className="fk-section">
              <h4>Specifications</h4>
              <dl className="fk-table">{table.map(([k, v]) => <div key={k + v}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
            </div>
            <Reviews tone={active} rating={m.rating} total={m.reviews} />
            <div className="fk-section">
              <h4>You may also like</h4>
              <div className="fk-recs">
                {watches.filter((r) => r.id !== active).map((r) => (
                  <button type="button" key={r.id} className="fk-rec" onClick={(e) => {
                    (e.currentTarget as HTMLButtonElement).blur();
                    setPick(r.id);
                    requestAnimationFrame(() => {
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                      const b = document.querySelector('.fk-panel') as HTMLElement | null;
                      b?.scrollTo({ top: 0, behavior: 'smooth' });
                    });
                  }}>
                    <img src={r.image} alt={r.name} />
                    <span className="fk-rec-name">{r.name}</span>
                    <span className="fk-rec-sub">{r.finish}</span>
                    <span className="fk-rec-price">₹{usd(prices[r.id])}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ); return asPage ? <div className="fk-panel fk-page">{body}</div> : <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="fk-panel">{body}</DialogContent></Dialog>; })()}
    </>
  );
}
