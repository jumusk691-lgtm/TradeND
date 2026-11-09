import { useCallback, useEffect, useState } from 'react';
import { Splash } from '@/components/Splash';
import { Dashboard } from '@/components/Dashboard';
import { SupportModal } from '@/components/SupportModal';
import { Ticker } from '@/components/Ticker';
import { usePersistentState } from '@/hooks/usePersistentState';
import { makeTx } from '@/components/WalletPanel';
import type { DashboardTab, Position, WalletTx } from '@/types';

// Firebase imports for Realtime Database balance fetching
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, onValue } from 'firebase/database';

// Firebase configuration
const firebaseConfig = {
  databaseURL: "https://tradend-default-rtdb.firebaseio.com/"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getDatabase(app);

const STARTING_BALANCE = 50000;

function App() {
  const [view, setView] = useState<'splash' | 'dashboard'>('splash');
  const [supportOpen, setSupportOpen] = useState(false);

  // Persistent client-side session state (localStorage fallback)
  const [walletBalance, setWalletBalance] = usePersistentState<number>(
    'tradend:wallet',
    STARTING_BALANCE
  );
  
  const [positions, setPositions] = usePersistentState<Position[]>('tradend:positions', []);
  const [transactions, setTransactions] = usePersistentState<WalletTx[]>(
    'tradend:txns',
    []
  );
  const [activeTab, setActiveTab] = usePersistentState<DashboardTab>(
    'tradend:tab',
    'markets'
  );

  // 🔥 FIREBASE REAL-TIME BALANCE LISTENER (Real Account Funds Fetch)
  useEffect(() => {
    const currentUid = localStorage.getItem('tradend:uid') || 'default_user';
    const balanceRef = ref(db, `users_details/${currentUid}/funds/balance`);

    const unsubscribe = onValue(
      balanceRef,
      (snapshot) => {
        const serverBalance = snapshot.val();
        if (serverBalance !== null && serverBalance !== undefined) {
          const parsedBal = Number(serverBalance);
          if (!isNaN(parsedBal)) {
            setWalletBalance(parsedBal);
          }
        }
      },
      (error) => {
        console.error("Firebase balance fetch error:", error);
      }
    );

    return () => unsubscribe();
  }, [setWalletBalance]);

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
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }, []);

  const handleBackToSplash = useCallback(() => {
    setView('splash');
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }, []);

  // --- Position handlers ---
  const openPosition = useCallback(
    (p: Position) => {
      setPositions((prev) => [...prev, p]);
      setWalletBalance((b) => Math.max(0, b - p.margin));
    },
    [setPositions, setWalletBalance]
  );

  const closePosition = useCallback(
    (id: string, currentPrice?: number) => {
      setPositions((prev) => {
        const pos = prev.find((p) => p.id === id);
        if (pos) {
          const cur = currentPrice ?? pos.currentPrice;
          const dir = pos.side === 'BUY' ? 1 : -1;
          const pnl = (cur - pos.entryPrice) * pos.qty * dir;
          setWalletBalance((b) => Math.max(0, b + pos.margin + pnl));
        }
        return prev.filter((p) => p.id !== id);
      });
    },
    [setPositions, setWalletBalance]
  );

  // --- Wallet handlers ---
  const handleDeposit = useCallback(
    (amount: number, method: string) => {
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
          <Dashboard
            activeTab={activeTab}
            onTabChange={setActiveTab}
            walletBalance={walletBalance}
            positions={positions}
            transactions={transactions}
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
