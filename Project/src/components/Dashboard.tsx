
import { useMemo, useState, useCallback, useEffect } from 'react';

import { INSTRUMENTS, getInstrument } from '@/data/instruments';
import { DERIVATIVE_CONTRACTS } from '@/data/derivatives';

import { CandleChart } from '@/components/CandleChart';
import { ContractBrowser } from '@/components/ContractBrowser';
import { TradePanel } from '@/components/TradePanel';
import { PositionsPanel } from '@/components/PositionsPanel';
import { WalletPanel } from '@/components/WalletPanel';
import { WatchlistPanel } from '@/components/WatchlistPanel';
import { Navbar } from '@/components/Navbar';

import { useLivePrices } from '@/hooks/useLivePrices';
import { fmtINR } from '@/lib/format';

import type { DashboardTab, Position, TradeHistory, WalletTx } from '@/types';

interface DashboardProps {
  activeTab: DashboardTab;
  onTabChange: (t: DashboardTab) => void;
  walletBalance: number;
  watchlist: any[];
  positions: Position[];
  transactions: WalletTx[];
  onToggleWatch: (contract: any) => void;
  onRemoveWatch: (contract: any) => void;
  onOpenPosition: (p: Position) => void;
  onClosePosition: (id: string, reason?: 'EXIT' | 'EXIT_ALL') => void;
  onCloseAllPositions: () => void;
  tradeHistory: TradeHistory[];
  showTradeHistory: boolean;
  onToggleTradeHistory: (visible: boolean) => void;
  onDeposit: (amount: number, method: string) => void;
  onWithdraw: (amount: number, method: string) => void;
  onBackToSplash: () => void;
  onOpenSupport: () => void;
}

const DEFAULT_SYMBOL = 'NIFTY 50';

export function Dashboard(props: DashboardProps) {
  const {
    activeTab,
    onTabChange,
    walletBalance,
    watchlist,
    positions,
    transactions,
    onToggleWatch,
    onRemoveWatch,
    onOpenPosition,
    onClosePosition,
    onCloseAllPositions,
    tradeHistory,
    showTradeHistory,
    onToggleTradeHistory,
    onDeposit,
    onWithdraw,
    onBackToSplash,
    onOpenSupport,
  } = props;

  const [selected, setSelected] = useState(DEFAULT_SYMBOL);
  const [selectedContract, setSelectedContract] = useState<any>(null);

  // Select a contract or symbol safely.
  const handleSelectContract = useCallback((contractOrSymbol: any) => {
    if (!contractOrSymbol) return;

    if (typeof contractOrSymbol === 'object') {
      const symbol = String(contractOrSymbol.symbol || '').trim();

      setSelectedContract({ ...contractOrSymbol });

      if (symbol) {
        setSelected(symbol);
      }

      return;
    }

    const symbol = String(contractOrSymbol).trim();

    if (!symbol) return;

    setSelected(symbol);

    setSelectedContract((previous: any) => {
      return previous?.symbol === symbol ? previous : null;
    });
  }, []);

  // Build initial prices.
  const seeds = useMemo(() => {
    const prices: Record<string, number> = {};

    for (const instrument of [...INSTRUMENTS, ...DERIVATIVE_CONTRACTS]) {
      if (instrument?.symbol && Number.isFinite(Number(instrument.price))) {
        prices[instrument.symbol] = Number(instrument.price);
      }
    }

    return prices;
  }, []);

  // Live market prices, including prices received by an open TradePanel.
  const simulatedPrices = useLivePrices(seeds, 2200);
  const [syncedPrices, setSyncedPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    const handlePrice = (event: Event) => {
      const detail = (event as CustomEvent<{ symbol?: string; price?: number }>).detail;
      if (!detail?.symbol || !Number.isFinite(detail.price) || detail.price <= 0) return;
      setSyncedPrices((previous) => ({ ...previous, [detail.symbol]: detail.price as number }));
    };

    window.addEventListener('tradend:price', handlePrice);
    return () => window.removeEventListener('tradend:price', handlePrice);
  }, []);

  const livePrices = useMemo(
    () => ({ ...simulatedPrices, ...syncedPrices }),
    [simulatedPrices, syncedPrices],
  );

  // Find selected instrument safely.
  const selectedInstrument = useMemo(() => {
    return (
      getInstrument(selected) ||
      DERIVATIVE_CONTRACTS.find(
        (item: any) => item.symbol === selected
      ) ||
      INSTRUMENTS.find(
        (item: any) => item.symbol === selected
      ) ||
      INSTRUMENTS[0] ||
      DERIVATIVE_CONTRACTS[0] ||
      { symbol: DEFAULT_SYMBOL, price: 0 }
    );
  }, [selected]);

  const basePrice =
    seeds[selected] ??
    Number(selectedInstrument?.price) ??
    0;

  const livePrice =
    Number(livePrices[selected]) > 0
      ? Number(livePrices[selected])
      : basePrice;

  // Get the complete selected contract.
  const activeContract = useMemo(() => {
    if (selectedContract?.symbol === selected) {
      return selectedContract;
    }

    return (
      DERIVATIVE_CONTRACTS.find(
        (item: any) => item.symbol === selected
      ) ||
      INSTRUMENTS.find(
        (item: any) => item.symbol === selected
      ) ||
      selectedInstrument
    );
  }, [selected, selectedContract, selectedInstrument]);

  return (
    <div className="min-h-screen bg-ink text-white">

      <div className="pointer-events-none fixed inset-0 grid-bg opacity-30" />

      <Navbar
        activeTab={activeTab}
        onTabChange={onTabChange}
        walletBalance={walletBalance}
        onBackToSplash={onBackToSplash}
        onOpenSupport={onOpenSupport}
      />

      <main className="relative mx-auto max-w-7xl px-4 sm:px-6 py-6">

        {activeTab === 'markets' && (
          <MarketsView
            selected={selected}
            selectedContract={activeContract}
            onSelect={handleSelectContract}
            livePrices={livePrices}
            basePrice={basePrice}
            livePrice={livePrice}
            watchlist={watchlist}
            onToggleWatch={onToggleWatch}
            onRemoveWatch={onRemoveWatch}
            walletBalance={walletBalance}
            onOpenPosition={onOpenPosition}
            positions={positions}
            onClosePosition={onClosePosition}
          />
        )}

        {activeTab === 'wallet' && (
          <div id="wallet" className="grid gap-6 lg:grid-cols-2">

            <WalletPanel
              balance={walletBalance}
              transactions={transactions}
              onDeposit={onDeposit}
              onWithdraw={onWithdraw}
            />

            <div className="space-y-6">

              <BalanceSummary
                balance={walletBalance}
                positionsCount={positions.length}
                txCount={transactions.length}
              />

              <PositionsPanel
                positions={positions}
                livePrices={livePrices}
                onClose={onClosePosition}
                onCloseAll={onCloseAllPositions}
                tradeHistory={tradeHistory}
                showTradeHistory={showTradeHistory}
                onToggleTradeHistory={onToggleTradeHistory}
              />

            </div>
          </div>
        )}

        {activeTab === 'positions' && (
          <div id="positions" className="grid gap-6 lg:grid-cols-3">

            <div className="lg:col-span-2 space-y-6">
              <CandleChart
                symbol={selected}
                basePrice={basePrice}
                livePrice={livePrice}
              />
            </div>

            <div className="space-y-6">

              <PositionsPanel
                positions={positions}
                livePrices={livePrices}
                onClose={onClosePosition}
                onCloseAll={onCloseAllPositions}
                tradeHistory={tradeHistory}
                showTradeHistory={showTradeHistory}
                onToggleTradeHistory={onToggleTradeHistory}
              />

              <WatchlistPanel
                watchlist={watchlist}
                livePrices={livePrices}
                onSelect={handleSelectContract}
                onRemove={onRemoveWatch}
                selected={selected}
              />

            </div>
          </div>
        )}

      </main>

      <footer className="relative mt-8 border-t border-white/5">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 text-sm">

            <div>
              <div className="font-display text-lg font-bold mb-2">
                <span className="gold-text">TRA</span>
                <span className="accent-text">DEND</span>
              </div>

              <p className="text-xs text-gray-500 leading-relaxed">
                Zero-brokerage, ultra-secure trading for NSE, BSE &amp; MCX.
                Built for speed, designed for trust.
              </p>
            </div>

            <FooterCol
              title="Platform"
              links={['Markets', 'Wallet', 'Positions', 'Download App']}
            />

            <FooterCol
              title="Markets"
              links={['Nifty 50', 'Sensex', 'Gold Futures', 'Bank Nifty']}
            />

            <FooterCol
              title="Legal"
              links={[
                'Privacy Policy',
                'Terms of Service',
                'Risk Disclosure',
                'Sitemap'
              ]}
            />

          </div>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-white/5 pt-5 text-xs text-gray-600">

            <span>
              © {new Date().getFullYear()} TRADEND · zerobrokerageapp.in
            </span>

            <span className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              All systems operational
            </span>

          </div>
        </div>
      </footer>
    </div>
  );
}

function MarketsView(props: {
  selected: string;
  selectedContract: any;
  onSelect: (contractOrSymbol: any) => void;
  livePrices: Record<string, number>;
  basePrice: number;
  livePrice: number;
  watchlist: any[];
  onToggleWatch: (contract: any) => void;
  onRemoveWatch: (contract: any) => void;
  walletBalance: number;
  onOpenPosition: (p: Position) => void;
  positions: Position[];
  onClosePosition: (id: string) => void;
}) {
  const {
    selected,
    selectedContract,
    onSelect,
    livePrices,
    basePrice,
    livePrice,
    watchlist,
    onToggleWatch,
    onRemoveWatch,
    walletBalance,
    onOpenPosition,
    positions,
    onClosePosition,
  } = props;

  return (
    <div id="markets" className="space-y-6">

      <ContractBrowser
        selected={selected}
        onSelect={onSelect}
        onAddWatch={onToggleWatch}
        watchlist={watchlist}
      />

      <div className="grid gap-6 lg:grid-cols-3">

        <div className="lg:col-span-2 space-y-6">
          <CandleChart
            symbol={selected}
            basePrice={basePrice}
            livePrice={livePrice}
          />
        </div>

        <div className="space-y-6">

          <TradePanel
            symbol={selected}
            contract={selectedContract}
            livePrice={livePrice}
            walletBalance={walletBalance}
            onOpenPosition={onOpenPosition}
          />

          <WatchlistPanel
            watchlist={watchlist}
            livePrices={livePrices}
            onSelect={onSelect}
            onRemove={onRemoveWatch}
            selected={selected}
          />

          <PositionsPanel
            positions={positions}
            livePrices={livePrices}
            onClose={onClosePosition}
          />

        </div>
      </div>
    </div>
  );
}

function BalanceSummary({
  balance,
  positionsCount,
  txCount,
}: {
  balance: number;
  positionsCount: number;
  txCount: number;
}) {
  return (
    <div className="glass rounded-2xl p-5">

      <h3 className="font-display text-lg font-bold text-white mb-4">
        Account Summary
      </h3>

      <div className="grid grid-cols-3 gap-3">

        <StatCard
          label="Balance"
          value={fmtINR(balance, { compact: true })}
          tone="accent"
        />

        <StatCard
          label="Positions"
          value={String(positionsCount)}
          tone="white"
        />

        <StatCard
          label="Transactions"
          value={String(txCount)}
          tone="white"
        />

      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'accent' | 'white' | 'gold';
}) {
  const color =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'gold'
        ? 'text-gold'
        : 'text-white';

  return (
    <div className="rounded-xl border border-white/5 bg-black/40 p-3 text-center">

      <div className="text-[11px] uppercase tracking-wider text-gray-500">
        {label}
      </div>

      <div className={`mt-1 font-display text-lg font-bold ${color}`}>
        {value}
      </div>

    </div>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: string[];
}) {
  return (
    <div>

      <h4 className="font-semibold text-white text-sm mb-2">
        {title}
      </h4>

      <ul className="space-y-1.5">
        {links.map((link) => (
          <li key={link}>
            <a
              href="#"
              className="text-xs text-gray-500 hover:text-accent transition-colors"
            >
              {link}
            </a>
          </li>
        ))}
      </ul>

    </div>
  );
}
