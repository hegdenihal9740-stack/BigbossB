import { Link } from '@tanstack/react-router';
import { goBackOrTo } from '@/lib/back';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import steel from '@/assets/watch-steel.jpg';
import bigBLogoDark from '@/assets/big-b-logo-dark.png';

export function AccountLayout({ title, children }: { title: string; children: ReactNode }) {
  return <main className="account-auth-page min-h-screen font-sans">
    <header className="border-b border-border px-5 py-5"><Button asChild variant="ghost"><Link to="/collection" onClick={(e) => { if (goBackOrTo('/collection')) e.preventDefault(); }}><ArrowLeft />Back</Link></Button></header>
    <div className="mx-auto grid max-w-5xl gap-10 px-6 py-12 md:grid-cols-2 md:py-20">
      <div className="hidden md:block"><img src={steel} alt="BIG-B brushed steel watch" className="aspect-square w-full rounded-md object-cover" /></div>
      <section className="account-auth-card mx-auto w-full max-w-md"><img className="account-auth-logo" src={bigBLogoDark} alt="BIG-B" /><p className="account-auth-eyebrow mb-3 text-sm">CUSTOMER ACCOUNT</p><h1 className="mb-8 font-sans text-3xl font-semibold">{title}</h1>{children}</section>
    </div>
  </main>;
}