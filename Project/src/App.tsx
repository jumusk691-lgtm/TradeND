
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

import { initializeApp, getApps } from 'firebase/app';
import {
  getDatabase,
  ref,
  onValue,
  set,
  push,
  remove,
  query,
  orderByChild,
  equalTo,
  runTransaction,
} from 'firebase/database';

const firebaseConfig = {
  databaseURL: 'https://trade-f600a-default-rtdb.firebaseio.com/',
};

const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApps()[0];

const db = getDatabase(app);

const STARTING_BALANCE = 50000;

function App() {
  const [view, setView] = useState<'splash' | 'dashboard'>('splash');
  const [supportOpen, setSupportOpen] = useState(false);

  const [walletBalance, setWalletBalance] =
    usePersistentState<number>('tradend:wallet', STARTING_BALANCE);

  const [watchlist, setWatchlist] =
    usePersistentState<any[]>('tradend:watchlist', []);

  const [positions, setPositions] =
    usePersistentState<Position[]>('tradend:positions', []);

  const [transactions, setTransactions] =
    usePersistentState<WalletTx[]>('tradend:txns', []);

  const [activeTab, setActiveTab] =
    usePersistentState<DashboardTab>('tradend:tab', 'markets');

  // =====================================================
  // 1. FIREBASE BALANCE FETCH / LIVE SYNC
  // =====================================================

  useEffect(() => {
    const uid = localStorage.getItem('tradend:uid');
    if (!uid) return;

    const balanceRef = ref(
      db,
      `users_details/${uid}/funds/balance`
    );

    const unsubscribe = onValue(
      balanceRef,
      (snapshot) => {
        const value = Number(snapshot.val());

        if (snapshot.exists() && Number.isFinite(value)) {
          setWalletBalance(value);
        }
      },
      (error) => {
        console.error('Firebase balance fetch error:', error);
      }
    );

    return unsubscribe;
  }, [view, setWalletBalance]);

  // =====================================================
  // 2. FIREBASE POSITIONS FETCH / LIVE SYNC
  // =====================================================

  useEffect(() => {
    const uid = localStorage.getItem('tradend:uid');

    if (!uid) {
      setPositions([]);
      return;
    }

    const positionsRef = ref(
      db,
      `users_details/${uid}/positions`
    );

    const unsubscribe = onValue(
      positionsRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setPositions([]);
          return;
        }

        const data = snapshot.val();

        const fetchedPositions: Position[] = Object.entries(data)
          .filter(([, value]) => value && typeof value === 'object')
          .map(([key, value]) => ({
            ...(value as Position),
            id: String((value as any).id || key),
          }));

        setPositions(fetchedPositions);
      },
      (error) => {
        console.error('Firebase positions fetch error:', error);
      }
    );

    return unsubscribe;
  }, [view, setPositions]);

  // =====================================================
  // 3. FIREBASE WATCHLIST FETCH
  // =====================================================

  useEffect(() => {
    const uid = localStorage.getItem('tradend:uid');

    if (!uid) {
      setWatchlist([]);
      return;
    }

    const sources = ['central_watchlist', 'forex_watchlist'];
    const syncedData: Record<string, any> = {};
    const unsubscribeList: Array<() => void> = [];

    let active = true;

    const updateCombinedWatchlist = () => {
      if (active) {
        setWatchlist(Object.values(syncedData));
      }
    };

    sources.forEach((nodeName) => {
      const watchQuery = query(
        ref(db, nodeName),
        orderByChild('uid'),
        equalTo(uid)
      );

      const unsubscribe = onValue(
        watchQuery,
        (snapshot) => {
          if (!active) return;

          const nodeData: Record<string, any> = {};

          snapshot.forEach((child) => {
            const item = child.val();

            if (!item || !item.token) return;

            const recordId = `${nodeName}_${child.key}`;

            nodeData[recordId] = {
              ...item,
              __firebaseKey: child.key,
              __sourceNode: nodeName,
            };
          });

          Object.keys(syncedData).forEach((key) => {
            if (key.startsWith(`${nodeName}_`)) {
              delete syncedData[key];
            }
          });

          Object.assign(syncedData, nodeData);
          updateCombinedWatchlist();

          console.log(
            `Firebase ${nodeName} loaded:`,
            Object.keys(nodeData).length
          );
        },
        (error) => {
          console.error(`${nodeName} fetch error:`, error);
        }
      );

      unsubscribeList.push(unsubscribe);
    });

    return () => {
      active = false;
      unsubscribeList.forEach((unsubscribe) => unsubscribe());
    };
  }, [view, setWatchlist]);

  // =====================================================
  // 4. LIVE MARKET PRICES
  // =====================================================

  const seeds: Record<string, number> = {};

  for (const instrument of INSTRUMENTS) {
    seeds[instrument.symbol] = instrument.price;
  }

  const livePrices = useLivePrices(seeds, 2200);

  // =====================================================
  // 5. BODY SCROLL CONTROL
  // =====================================================

  useEffect(() => {
    if (view === 'splash') {
      document.body.classList.add('splash-locked');
    } else {
      document.body.classList.remove('splash-locked');
    }

    return () => {
      document.body.classList.remove('splash-locked');
    };
  }, [view]);

  // =====================================================
  // 6. ENTER DASHBOARD
  // =====================================================

  const handleEnter = useCallback(() => {
    const uid = localStorage.getItem('tradend:uid');

    if (!uid) {
      console.warn('No active UID found. Sign in required.');
      return;
    }

    setView('dashboard');

    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }, []);

  // =====================================================
  // 7. LOGOUT
  // =====================================================

  const handleBackToSplash = useCallback(() => {
    localStorage.removeItem('tradend:uid');
    localStorage.removeItem('tradend:email');
    localStorage.removeItem('tradend:name');

    setWatchlist([]);
    setPositions([]);
    setView('splash');

    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }, [setWatchlist, setPositions]);

  // =====================================================
  // 8. REMOVE WATCHLIST ITEM
  // =====================================================

  const removeWatch = useCallback(
    async (symbolOrObject: any) => {
      const isObject =
        typeof symbolOrObject === 'object' &&
        symbolOrObject !== null;

      const targetSymbol = isObject
        ? symbolOrObject.symbol
        : symbolOrObject;

      const targetToken =
        isObject && symbolOrObject.token != null
          ? String(symbolOrObject.token)
          : '';

      if (!targetSymbol && !targetToken) return;

      const item = watchlist.find((entry) => {
        if (!entry || typeof entry === 'string') return false;

        if (targetToken) {
          return String(entry.token || '') === targetToken;
        }

        return entry.symbol === targetSymbol;
      });

      if (!item) {
        console.warn('Watchlist item not found:', targetToken || targetSymbol);
        return;
      }

      if (!item.__firebaseKey || !item.__sourceNode) {
        console.warn('Firebase record information missing');
        return;
      }

      try {
        await remove(
          ref(db, `${item.__sourceNode}/${item.__firebaseKey}`)
        );
      } catch (error) {
        console.error('Firebase watchlist delete error:', error);
      }
    },
    [watchlist]
  );

  // =====================================================
  // 9. ADD / TOGGLE WATCHLIST ITEM
  // =====================================================

  const toggleWatch = useCallback(
    async (contractOrSymbol: any) => {
      const isObject =
        typeof contractOrSymbol === 'object' &&
        contractOrSymbol !== null;

      const targetSymbol = isObject
        ? contractOrSymbol.symbol
        : contractOrSymbol;

      const targetToken =
        isObject && contractOrSymbol.token != null
          ? String(contractOrSymbol.token)
          : '';

      if (!targetSymbol && !targetToken) return;

      const exists = watchlist.some((item) => {
        if (!item) return false;

        if (typeof item === 'string') {
          return !targetToken && item === targetSymbol;
        }

        if (targetToken) {
          return String(item.token || '') === targetToken;
        }

        return item.symbol === targetSymbol;
      });

      if (exists) {
        await removeWatch(contractOrSymbol);
        return;
      }

      const uid = localStorage.getItem('tradend:uid');

      if (!uid) {
        console.error('User UID not found');
        return;
      }

      const newItem = isObject
        ? { ...contractOrSymbol }
        : {
            symbol: targetSymbol,
            name: targetSymbol,
            exchange: 'NSE',
            exch_seg: 'NSE',
            lotsize: 1,
          };

      const exchange = String(
        newItem.exch_seg || newItem.exchange || ''
      ).toUpperCase();

      const instrumentType = String(
        newItem.instrumenttype || newItem.kind || ''
      ).toUpperCase();

      const isForex =
        exchange.includes('FOREX') ||
        exchange.includes('CRYPTO') ||
        exchange.includes('CURRENCY') ||
        instrumentType.includes('FOREX') ||
        instrumentType.includes('CURRENCY');

      const nodeName = isForex
        ? 'forex_watchlist'
        : 'central_watchlist';

      try {
        const newRef = push(ref(db, nodeName));

        await set(newRef, {
          ...newItem,
          uid,
        });

        console.log('Watchlist saved:', nodeName, targetSymbol);
      } catch (error) {
        console.error('Firebase watchlist save error:', error);
      }
    },
    [watchlist, removeWatch]
  );

  // =====================================================
  // 10. OPEN POSITION
  // ATOMIC FIREBASE BALANCE + POSITION UPDATE
  // =====================================================

  const openPosition = useCallback(
    async (p: Position) => {
      const uid = localStorage.getItem('tradend:uid');

      if (!uid) {
        console.error('Cannot open position: user UID missing');
        return;
      }

      const margin = Number(p.margin);

      if (!Number.isFinite(margin) || margin <= 0) {
        console.error('Invalid position margin:', p.margin);
        return;
      }

      if (!p.id) {
        console.error('Position ID is missing');
        return;
      }

      const userRef = ref(db, `users_details/${uid}`);

      try {
        const result = await runTransaction(userRef, (current) => {
          if (!current || !current.funds) return;

          const balance = Number(current.funds.balance);

          if (!Number.isFinite(balance) || balance < margin) {
            return;
          }

          const existingPositions = current.positions || {};

          if (existingPositions[p.id]) {
            return;
          }

          return {
            ...current,
            funds: {
              ...current.funds,
              balance: balance - margin,
            },
            positions: {
              ...existingPositions,
              [p.id]: {
                ...p,
                id: p.id,
                margin,
                margin_blocked: margin,
                status: 'OPEN',
              },
            },
          };
        });

        if (!result.committed) {
          console.warn(
            'Order rejected: insufficient balance, missing Firebase balance, or duplicate position.'
          );
          return;
        }

        const updatedBalance = Number(
          result.snapshot.child('funds/balance').val()
        );

        if (Number.isFinite(updatedBalance)) {
          setWalletBalance(updatedBalance);
        }

        console.log('Position opened and saved to Firebase:', p.id);
      } catch (error) {
        console.error('Firebase open position error:', error);
      }
    },
    [setWalletBalance]
  );

  // =====================================================
  // 11. CLOSE POSITION
  // ATOMIC FIREBASE POSITION REMOVE + BALANCE UPDATE
  // =====================================================

  const closePosition = useCallback(
    async (id: string) => {
      const uid = localStorage.getItem('tradend:uid');

      if (!uid) {
        console.error('Cannot close position: user UID missing');
        return;
      }

      const pos = positions.find((item) => item.id === id);

      if (!pos) {
        console.warn('Position not found:', id);
        return;
      }

      const currentPrice = Number(
        livePrices[pos.symbol] ?? pos.currentPrice
      );

      const entryPrice = Number(pos.entryPrice);
      const qty = Number(pos.qty);
      const margin = Number(pos.margin);

      if (
        !Number.isFinite(currentPrice) ||
        !Number.isFinite(entryPrice) ||
        !Number.isFinite(qty) ||
        !Number.isFinite(margin)
      ) {
        console.error('Invalid position values:', pos);
        return;
      }

      const direction = pos.side === 'BUY' ? 1 : -1;
      const pnl = (currentPrice - entryPrice) * qty * direction;

      const userRef = ref(db, `users_details/${uid}`);

      try {
        const result = await runTransaction(userRef, (current) => {
          if (!current || !current.funds || !current.positions) return;

          const serverPosition = current.positions[id];

          if (!serverPosition) return;

          const balance = Number(current.funds.balance);
          const serverMargin = Number(
            serverPosition.margin_blocked ?? serverPosition.margin
          );

          if (
            !Number.isFinite(balance) ||
            !Number.isFinite(serverMargin)
          ) {
            return;
          }

          const updatedPositions = { ...current.positions };
          delete updatedPositions[id];

          return {
            ...current,
            funds: {
              ...current.funds,
              balance: balance + serverMargin + pnl,
            },
            positions: updatedPositions,
          };
        });

        if (!result.committed) {
          console.warn('Position close failed: position not found or Firebase update rejected.');
          return;
        }

        const updatedBalance = Number(
          result.snapshot.child('funds/balance').val()
        );

        if (Number.isFinite(updatedBalance)) {
          setWalletBalance(updatedBalance);
        }

        console.log('Position closed in Firebase:', id);
      } catch (error) {
        console.error('Firebase close position error:', error);
      }
    },
    [positions, livePrices, setWalletBalance]
  );

  // =====================================================
  // 12. WALLET DEPOSIT
  // =====================================================

  const handleDeposit = useCallback(
    (amount: number, method: string) => {
      if (!Number.isFinite(amount) || amount <= 0) return;

      // This keeps the existing local transaction behavior.
      // Actual wallet credit must happen only after verified payment/admin approval.
      setTransactions((prev) => [
        makeTx('DEPOSIT', amount, method, 'COMPLETED'),
        ...prev,
      ]);
    },
    [setTransactions]
  );

  // =====================================================
  // 13. WALLET WITHDRAW
  // =====================================================

  const handleWithdraw = useCallback(
    async (amount: number, method: string) => {
      const uid = localStorage.getItem('tradend:uid');

      if (!uid || !Number.isFinite(amount) || amount <= 0) return;

      // A withdrawal is recorded as pending.
      // Balance is not deducted until the withdrawal is approved.
      const tx = makeTx('WITHDRAW', amount, method, 'PENDING');

      try {
        const requestRef = push(
          ref(db, `users_details/${uid}/withdrawal_requests`)
        );

        await set(requestRef, {
          ...tx,
          amount,
          method,
          status: 'PENDING',
          timestamp: Date.now(),
        });

        setTransactions((prev) => [tx, ...prev]);
      } catch (error) {
        console.error('Firebase withdrawal request error:', error);
      }
    },
    [setTransactions]
  );

  // =====================================================
  // 14. APP UI
  // =====================================================

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

      <SupportModal
        open={supportOpen}
        onClose={() => setSupportOpen(false)}
      />
    </>
  );
}

export default App;
