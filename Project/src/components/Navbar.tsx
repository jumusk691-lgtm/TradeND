import { useState } from 'react';
import {
  TrendingUp,
  Download,
  LifeBuoy,
  Menu,
  X,
  ShieldCheck,
  Wallet,
  Table2,
  LineChart,
} from 'lucide-react';
import { APK_URL, type DashboardTab } from '@/types';
import { fmtINR } from '@/lib/format';

interface NavbarProps {
  activeTab: DashboardTab;
  onTabChange: (t: DashboardTab) => void;
  walletBalance: number;
  onBackToSplash: () => void;
  onOpenSupport: () => void;
}

const TABS: { id: DashboardTab; label: string; icon: typeof Table2 }[] = [
  { id: 'markets', label: 'Markets', icon: LineChart },
  { id: 'wallet', label: 'Wallet', icon: Wallet },
  { id: 'positions', label: 'Positions', icon: Table2 },
];

export function Navbar({
  activeTab,
  onTabChange,
  walletBalance,
  onBackToSplash,
  onOpenSupport,
}: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 glass border-b border-white/5">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <button
            onClick={onBackToSplash}
            className="flex items-center gap-2 shrink-0"
            aria-label="TRADEND home"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/40 bg-gradient-to-br from-accent/20 to-gold/10">
              <TrendingUp className="h-5 w-5 text-accent" />
            </div>
            <span className="font-display text-xl font-extrabold tracking-tight">
              <span className="gold-text">TRA</span>
              <span className="accent-text">DEND</span>
            </span>
          </button>

          {/* Desktop tabs */}
          <nav className="hidden md:flex items-center gap-1">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => onTabChange(t.id)}
                  className={`nav-link flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    active ? 'text-white active' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:flex flex-col items-end leading-none">
              <span className="text-[10px] uppercase tracking-wider text-gray-500">Balance</span>
              <span className="font-mono text-sm font-semibold text-white">
                {fmtINR(walletBalance, { compact: true })}
              </span>
            </div>

            <button
              onClick={onOpenSupport}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-gray-300 hover:border-accent/40 hover:text-white transition-colors"
            >
              <LifeBuoy className="h-3.5 w-3.5" />
              Support
            </button>

            <a
              href={APK_URL}
              download="TRADEND.apk"
              className="inline-flex items-center gap-2 rounded-lg bg-gold/15 border border-gold/40 px-4 py-2.5 text-sm font-bold text-gold hover:bg-gold/25 transition-colors"
            >
              <Download className="h-4 w-4" />
              <span>Download APK</span>
            </a>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-gray-300"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Security strip */}
        <div className="flex items-center gap-2 border-t border-white/5 py-1.5 text-[11px] text-gray-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-emerald-400/90 font-medium">Safe &amp; Verified</span>
          <span className="text-gray-700">·</span>
          <span>Funds &amp; Data Secure · 256-bit Encrypted</span>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-t border-white/5 bg-black/95 px-4 py-3 space-y-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  onTabChange(t.id);
                  setMobileOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                  active ? 'bg-accent/15 text-white' : 'text-gray-400 hover:bg-white/5'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
          <button
            onClick={() => {
              onOpenSupport();
              setMobileOpen(false);
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-400 hover:bg-white/5"
          >
            <LifeBuoy className="h-4 w-4" />
            Support
          </button>
        </div>
      )}
    </header>
  );
}
