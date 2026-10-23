import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { watchCloseups, type watches } from '@/lib/watches';

export function WatchGallery({ watch }: { watch: typeof watches[number] }) {
  const [view, setView] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const views = ['Portrait', 'Dial', watch.id === 'rosegold' ? 'Strap' : 'Bracelet'];
  const closeup = watchCloseups[watch.id][view];
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { setReducedMotion(preference.matches); if (preference.matches) setPlaying(false); };
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!playing || reducedMotion) return;
    const timer = window.setInterval(() => setView(v => (v + 1) % 3), 7000);
    return () => window.clearInterval(timer);
  }, [playing, reducedMotion]);
  const selectView = (next: number) => { setPlaying(false); setView((next + 3) % 3); };
  return <section className="watch-detail-gallery" aria-labelledby="watch-details-title">
    <div className="watch-detail-copy">
      <p className="watch-detail-eyebrow">A closer look</p>
      <h2 id="watch-details-title">{watch.name}, in detail.</h2>
      <p className="collection-description">{watch.description}</p>
      <dl className="watch-detail-facts"><div><dt>Finish</dt><dd>{watch.finish}</dd></div>{watch.details.map((detail, index) => <div key={detail}><dt>{['Dial', 'Case detail', 'Bracelet / strap'][index]}</dt><dd>{detail}</dd></div>)}</dl>
      <div className="watch-closeup-copy" key={view} aria-live={playing ? 'off' : 'polite'}><p className="watch-detail-eyebrow">0{view + 1} / 03 — {views[view]}</p><h3>{closeup?.title}</h3><p>{closeup?.description}</p></div>
    </div>
    <div className="watch-detail-images" data-playing={playing && !reducedMotion}>
      <div className="collection-photo" data-view={view} key={view}>
        <img src={watch.image} alt={`${watch.name} — ${views[view]?.toLowerCase()} detail`} loading="lazy" />
        <span className="collection-photo-label">{views[view]}</span>
      </div>
      <div className="watch-gallery-toolbar" role="toolbar" aria-label={`${watch.name} close-up controls`}>
        <span>{watch.name} <span className="watch-gallery-counter">/ 0{view + 1}</span></span>
        <div><Button size="icon" variant="ghost" aria-label="Previous close-up" title="Previous close-up" onClick={() => selectView(view - 1)}><ChevronLeft /></Button><Button size="icon" variant="ghost" aria-label={playing ? 'Pause close-ups' : 'Play close-ups'} title={playing ? 'Pause close-ups' : 'Play close-ups'} disabled={reducedMotion} onClick={() => setPlaying(v => !v)}>{playing ? <Pause /> : <Play />}</Button><Button size="icon" variant="ghost" aria-label="Next close-up" title="Next close-up" onClick={() => selectView(view + 1)}><ChevronRight /></Button></div>
      </div>
      <div className="collection-image-tabs" role="group" aria-label={`${watch.name} image views`}>
        {views.map((label, i) => <Button key={label} variant="ghost" className="collection-image-tab" aria-pressed={view === i} onClick={() => selectView(i)}>
          <span className="collection-thumbnail" data-view={i}><img src={watch.image} alt="" loading="lazy" /></span><span>{label}</span>
        </Button>)}
      </div>
    </div>
  </section>;
}