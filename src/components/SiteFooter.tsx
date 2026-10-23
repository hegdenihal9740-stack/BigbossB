import { Link } from '@tanstack/react-router';
import bigBLogoDark from '@/assets/big-b-logo-dark.png';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-brand"><img src={bigBLogoDark} alt="BIG-B" /><p>© {new Date().getFullYear()} BIG-B. All rights reserved.</p></div>
      <nav aria-label="Policies and contact">
        <Link to="/shipping-policy">Shipping Policy</Link>
        <Link to="/returns">Returns &amp; Warranty</Link>
        <Link to="/contact">Contact &amp; WhatsApp</Link>
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/terms">Terms &amp; Conditions</Link>
      </nav>
    </footer>
  );
}
