import { useCallback, useEffect, useState } from 'react';
import { Splash } from '@/components/Splash';
import { Dashboard } from '@/components/Dashboard';
import { SupportModal } from '@/components/SupportModal';
import { Ticker } from '@/components/Ticker';
import { INSTRUMENTS } from '@/data/instruments';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useLivePrices } from '@/hooks/useLivePrices';
import { makeTx } from '@/components/WalletPanel';
import type { DashboardTab, Position, WalletTx } from '@/types';

const STARTING_BALANCE = 100000;

function App() {
  const [view, setView] = useState<'splash' | 'dashboard'>('splash');
  const [supportOpen, setSupportOpen] = useState(false);

  // Persistent client-side session state (localStorage)
  const [walletBalance, setWalletBalance] = usePersistentState<number>(
    'tradend:wallet',
    STARTING_BALANCE
  );
  const [watchlist, setWatchlist] = usePersistentState<string[]>('tradend:watchlist', [
    'NIFTY 50',
    'RELIANCE',
    'GOLD FUT',
  ]);
  const [positions, setPositions] = usePersistentState<Position[]>('tradend:positions', []);
  const [transactions, setTransactions] = usePersistentState<WalletTx[]>(
    'tradend:txns',
    []
  );
  const [activeTab, setActiveTab] = usePersistentState<DashboardTab>(
    'tradend:tab',
    'markets'
  );

  // Live prices for the ticker (always running so it's live when dashboard shows)
  const seeds: Record<string, number> = {};
  for (const i of INSTRUMENTS) seeds[i.symbol] = i.price;
  const livePrices = useLivePrices(seeds, 2200);

  // Lock body scroll while on splash
  useEffect(() => {
    if (view === 'splash') {
      document.body.classList.add('splash-locked');
    } else {
      document.body.classList.remove('splash-locked');
    }
    return () => document.body.classList.remove('splash-locked');
  }, [view]);

  const handleEnter = useCallback(() => {
    setView('dashboard');
    // smooth scroll to top of dashboard
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }, []);

  const handleBackToSplash = useCallback(() => {
    setView('splash');
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }, []);

  // --- Watchlist handlers ---
  const toggleWatch = useCallback(
    (symbol: string) => {
      setWatchlist((prev) =>
        prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol]
      );
    },
    [setWatchlist]
  );

  const removeWatch = useCallback(
    (symbol: string) => {
      setWatchlist((prev) => prev.filter((s) => s !== symbol));
    },
    [setWatchlist]
  );

  // --- Position handlers ---
  const openPosition = useCallback(
    (p: Position) => {
      setPositions((prev) => [...prev, p]);
      // Deduct margin from balance
      setWalletBalance((b) => Math.max(0, b - p.margin));
    },
    [setPositions, setWalletBalance]
  );

  const closePosition = useCallback(
    (id: string) => {
      setPositions((prev) => {
        const pos = prev.find((p) => p.id === id);
        if (pos) {
          const cur = livePrices[pos.symbol] ?? pos.currentPrice;
          const dir = pos.side === 'BUY' ? 1 : -1;
          const pnl = (cur - pos.entryPrice) * pos.qty * dir;
          // return margin + PnL
          setWalletBalance((b) => Math.max(0, b + pos.margin + pnl));
        }
        return prev.filter((p) => p.id !== id);
      });
    },
    [setPositions, setWalletBalance, livePrices]
  );

  // --- Wallet handlers ---
  const handleDeposit = useCallback(
    (amount: number, method: string) => {
      // Instantly credit (simulated) + record completed tx
      setWalletBalance((b) => b + amount);
      setTransactions((prev) => [
        makeTx('DEPOSIT', amount, method, 'COMPLETED'),
        ...prev,
      ]);
    },
    [setWalletBalance, setTransactions]
  );

  const handleWithdraw = useCallback(
    (amount: number, method: string) => {
      // Deduct immediately, record as pending
      setWalletBalance((b) => Math.max(0, b - amount));
      setTransactions((prev) => [
        makeTx('WITHDRAW', amount, method, 'PENDING'),
        ...prev,
      ]);
    },
    [setWalletBalance, setTransactions]
  );

  return (
    <>
      {view === 'splash' ? (
        <Splash onEnter={handleEnter} />
      ) : (
        <>
          <Ticker livePrices={livePrices} />
          <Dashboard
            activeTab={activeTab}
            onTabChange={setActiveTab}
            walletBalance={walletBalance}
            watchlist={watchlist}
            positions={positions}
            transactions={transactions}
            onToggleWatch={toggleWatch}
            onRemoveWatch={removeWatch}
            onOpenPosition={openPosition}
            onClosePosition={closePosition}
            onDeposit={handleDeposit}
            onWithdraw={handleWithdraw}
            onBackToSplash={handleBackToSplash}
            onOpenSupport={() => setSupportOpen(true)}
          />
        </>
      )}

      <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
    </>
  );
}

export default App;
