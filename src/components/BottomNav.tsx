import { Link } from '@tanstack/react-router';
import { Home, UserRound, ShoppingCart } from 'lucide-react';
import { cart, useCart } from '@/lib/cart';

export function BottomNav() {
  const { count } = useCart();
  return <nav className="bnav" aria-label="Store navigation">
    <Link to="/" className="bnav-item"><Home size={22} /><span>Home</span></Link>
    <Link to="/account" className="bnav-item"><UserRound size={22} /><span>Account</span></Link>
    <button type="button" className="bnav-item" onClick={() => cart.setOpen(true)}>
      <span className="bnav-icon"><ShoppingCart size={22} />{count > 0 && <span className="bnav-badge">{count}</span>}</span><span>Cart</span>
    </button>
  </nav>;
}

