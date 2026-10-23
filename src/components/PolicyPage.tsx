import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ShopHeader } from '@/components/ShopHeader';
import { SiteFooter } from '@/components/SiteFooter';

export function PolicyPage({ title, children }: { title: string; children: ReactNode }) {
  return <main className="shop-page acc-page">
    <ShopHeader />
    <div className="acc-wrap">
      <h1 className="acc-h">{title}</h1>
      <section className="acc-card policy">{children}</section>
      <p className="fk-muted policy-links"><Link to="/shipping-policy">Shipping</Link> · <Link to="/returns">Returns &amp; refunds</Link> · <Link to="/contact">Contact</Link> · <Link to="/privacy">Privacy</Link> · <Link to="/terms">Terms</Link></p>
    </div>
    <SiteFooter />
  </main>;
}
export const meta = (title: string, description: string) => ({ meta: [{ title }, { name: 'description', content: description }, { property: 'og:title', content: title }, { property: 'og:description', content: description }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] });
