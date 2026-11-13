# TradeND — Live Data and Market-Hours Source

Complete contents of all files changed for selected-instrument WebSocket pricing, live candlesticks, and market-session validation. The source snapshot is intended to be copied or committed as-is.

## `Project/src/App.tsx`

```tsx
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Splash } from '@/components/Splash';
import { Dashboard } from '@/components/Dashboard';
import { SupportModal } from '@/components/SupportModal';
import { Ticker } from '@/components/Ticker';
import { usePersistentState } from '@/hooks/usePersistentState';
import { makeTx } from '@/components/WalletPanel';
import type { DashboardTab, Position, TradeHistoryEntry, WalletTx } from '@/types';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { onValue, orderByChild, equalTo, push, query, ref, remove, set } from 'firebase/database';
import { auth, db } from '@/lib/firebase';
import { normalizeTradeHistory } from '@/lib/tradeHistory';
const SourceBrowser = lazy(() =>
  import('@/components/SourceBrowser').then((module) => ({
    default: module.SourceBrowser,
  })),
);

const STARTING_BALANCE = 50000;

async function sendTradingRequest(payload: Record<string, unknown>) {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again to trade.');

  const token = await user.getIdToken();
  const response = await fetch('/api/trading', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(typeof result.error === 'string' ? result.error : 'Trading request could not be completed.');
  }

  return result;
}

function TradingApp() {

const [view, setView] = useState<'splash' | 'dashboard'>('splash');
const [supportOpen, setSupportOpen] = useState(false);

const [walletBalance, setWalletBalance] = useState<number>(STARTING_BALANCE);
const [positions, setPositions] = useState<Position[]>([]);
const [tradeHistory, setTradeHistory] = useState<TradeHistoryEntry[]>([]);
const [firebaseUid, setFirebaseUid] = useState<string | null>(null);
const [tradeHistoryLoading, setTradeHistoryLoading] = useState(false);
const [tradeHistoryError, setTradeHistoryError] = useState<string | null>(null);

const [watchlist, setWatchlist] =
usePersistentState<any[]>('tradend:watchlist', []);

const [transactions, setTransactions] =
usePersistentState<WalletTx[]>('tradend:txns', []);

const [activeTab, setActiveTab] =
usePersistentState<DashboardTab>('tradend:tab', 'markets');

useEffect(() => onAuthStateChanged(auth, (user) => {
  const uid = user?.uid ?? null;
  setFirebaseUid(uid);

  if (uid) {
    localStorage.setItem('tradend:uid', uid);
  } else {
    localStorage.removeItem('tradend:uid');
    setView('splash');
  }
}), []);

// =====================================================
// 1. FIREBASE TRADING ACCOUNT LISTENERS
// =====================================================

useEffect(() => {
  const currentUid = firebaseUid;
  if (!currentUid) {
    setWalletBalance(STARTING_BALANCE);
    setPositions([]);
    setTradeHistory([]);
    setTradeHistoryLoading(false);
    setTradeHistoryError(null);
    return;
  }

  const accountPath = `users_details/${currentUid}`;
  setTradeHistoryLoading(true);
  setTradeHistoryError(null);

  const unsubscribers = [
    onValue(ref(db, `${accountPath}/funds/balance`), (snapshot) => {
      if (!snapshot.exists()) {
        setWalletBalance(STARTING_BALANCE);
        return;
      }
      const balance = Number(snapshot.val());
      if (Number.isFinite(balance) && balance >= 0) setWalletBalance(balance);
    }, (error) => console.error('Firebase balance fetch error:', error)),
    onValue(ref(db, `${accountPath}/open_positions`), (snapshot) => {
      const records = snapshot.val();
      const nextPositions = records && typeof records === 'object'
        ? Object.entries(records).map(([id, value]) => ({
            ...(value as Record<string, unknown>),
            id: String((value as Record<string, unknown>).id ?? id),
          } as Position))
        : [];
      setPositions(nextPositions);
    }, (error) => console.error('Firebase positions fetch error:', error)),
    // Subscribe to the complete history node; the panel batches rendering for large histories.
    onValue(ref(db, `${accountPath}/trade_history`), (snapshot) => {
      setTradeHistory(normalizeTradeHistory(snapshot.val()));
      setTradeHistoryLoading(false);
      setTradeHistoryError(null);
    }, (error) => {
      console.error('Firebase history fetch error:', error);
      setTradeHistoryLoading(false);
      setTradeHistoryError(error.message || 'Unable to load trade history.');
    }),
  ];

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}, [firebaseUid]);

// =====================================================
// 2. FIREBASE WATCHLIST LISTENER
// =====================================================

useEffect(() => {
const currentUid = firebaseUid;

if (!currentUid) {
  setWatchlist([]);
  return;
}

const sources = [
  'central_watchlist',
  'forex_watchlist'
];

const syncedData: Record<string, any> = {};

const unsubscribeList: Array<() => void> = [];

let active = true;

const updateCombinedWatchlist = () => {
  if (!active) return;

  const combined = Object.values(syncedData);

  setWatchlist(combined);
};

sources.forEach((nodeName) => {

  const watchQuery = query(
    ref(db, nodeName),
    orderByChild('uid'),
    equalTo(currentUid)
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
          __sourceNode: nodeName
        };
      });

      // Remove old records from this Firebase node
      Object.keys(syncedData).forEach((key) => {
        if (key.startsWith(`${nodeName}_`)) {
          delete syncedData[key];
        }
      });

      // Add latest records
      Object.assign(syncedData, nodeData);

      updateCombinedWatchlist();

      console.log(
        `Firebase ${nodeName} loaded:`,
        Object.keys(nodeData).length
      );
    },

    (error) => {
      console.error(
        `Firebase ${nodeName} fetch error:`,
        error
      );
    }
  );

  unsubscribeList.push(unsubscribe);
});

return () => {
  active = false;

  unsubscribeList.forEach((unsubscribe) => {
    unsubscribe();
  });
};

}, [firebaseUid, setWatchlist]);


// =====================================================
// 4. BODY SCROLL CONTROL
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
// 5. ENTER DASHBOARD
// =====================================================

const handleEnter = useCallback(() => {

const currentUid = auth.currentUser?.uid ?? localStorage.getItem('tradend:uid');

if (currentUid) {
  setView('dashboard');

  requestAnimationFrame(() => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  });

} else {
  console.warn('No active UID found. Sign in required.');
}

}, []);

// =====================================================
// 6. LOGOUT
// =====================================================

const handleBackToSplash = useCallback(() => {

localStorage.removeItem('tradend:uid');
localStorage.removeItem('tradend:email');
localStorage.removeItem('tradend:name');
void signOut(auth).catch((error) => console.error('Firebase sign out error:', error));

setWatchlist([]);
setPositions([]);
setTradeHistory([]);
setWalletBalance(STARTING_BALANCE);

setView('splash');

requestAnimationFrame(() => {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
});

}, [setWatchlist]);

// =====================================================
// 7. REMOVE WATCHLIST ITEM
// TOKEN-BASED DELETE
// =====================================================

const removeWatch = useCallback(
(symbolOrObject: any) => {

const isObject =
    typeof symbolOrObject === 'object' &&
    symbolOrObject !== null;

  const targetSymbol = isObject
    ? symbolOrObject.symbol
    : symbolOrObject;

  const targetToken =
    isObject && symbolOrObject.token !== undefined &&
    symbolOrObject.token !== null
      ? String(symbolOrObject.token)
      : '';

  if (!targetSymbol && !targetToken) return;

  const item = watchlist.find((entry) => {

    if (!entry || typeof entry === 'string') {
      return false;
    }

    if (targetToken) {
      return String(entry.token || '') === targetToken;
    }

    return entry.symbol === targetSymbol;
  });

  if (!item) {
    console.warn(
      'Watchlist item not found:',
      targetToken || targetSymbol
    );
    return;
  }

  if (!item.__firebaseKey || !item.__sourceNode) {
    console.warn(
      'Firebase record information missing:',
      targetToken || targetSymbol
    );
    return;
  }

  const itemRef = ref(
    db,
    `${item.__sourceNode}/${item.__firebaseKey}`
  );

  remove(itemRef).catch((error) => {
    console.error(
      'Firebase watchlist delete error:',
      error
    );
  });

},
[watchlist]

);

// =====================================================
// 8. ADD / TOGGLE WATCHLIST ITEM
// COMPLETE CONTRACT + TOKEN CHECK
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
    isObject &&
    contractOrSymbol.token !== undefined &&
    contractOrSymbol.token !== null
      ? String(contractOrSymbol.token)
      : '';

  if (!targetSymbol && !targetToken) return;

  // Check existing contract by token.
  // If token is unavailable, use symbol as fallback.
  const exists = watchlist.some((item) => {

    if (!item) return false;

    if (typeof item === 'string') {
      return !targetToken && item === targetSymbol;
    }

    if (targetToken) {
      if (item.token !== undefined && item.token !== null) {
        return String(item.token) === targetToken;
      }

      return item.symbol === targetSymbol;
    }

    return item.symbol === targetSymbol;
  });

  // If already exists, remove that exact contract
  if (exists) {
    removeWatch(contractOrSymbol);
    return;
  }

  const currentUid = auth.currentUser?.uid ?? localStorage.getItem('tradend:uid');

  if (!currentUid) {
    console.error('User UID not found');
    return;
  }

  // Preserve the complete contract metadata
  const newItem = isObject
    ? { ...contractOrSymbol }
    : {
        symbol: targetSymbol,
        name: targetSymbol,
        exchange: 'NSE',
        exch_seg: 'NSE',
        lotsize: 1
      };

  // Select Firebase node
  const exchange = String(
    newItem.exch_seg ||
    newItem.exchange ||
    ''
  ).toUpperCase();

  const instrumentType = String(
    newItem.instrumenttype ||
    newItem.kind ||
    ''
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

  const newRef = push(ref(db, nodeName));

  try {

    await set(newRef, {
      ...newItem,
      uid: currentUid
    });

    console.log(
      `Watchlist saved successfully: ${nodeName}`,
      {
        symbol: targetSymbol,
        token: targetToken,
        contract: newItem
      }
    );

  } catch (error) {

    console.error(
      'Firebase watchlist save error:',
      error
    );

  }

},
[watchlist, removeWatch]

);

// =====================================================
// 9. SERVER-AUTHORITATIVE POSITION ACTIONS
// =====================================================

const openPosition = useCallback(async (position: Position) => {
  await sendTradingRequest({
    action: 'open',
    symbol: position.symbol,
    name: position.name,
    side: position.side,
    qty: position.qty,
    lots: position.lots,
    lotSize: position.lotSize,
    kind: position.kind,
    entryPrice: position.entryPrice,
    currentPrice: position.currentPrice,
    leverage: position.leverage,
    exchange: position.exchange,
    product: position.product,
    orderType: position.orderType,
  });
}, []);

const closePosition = useCallback(async (id: string, exitPrice: number) => {
  await sendTradingRequest({ action: 'close', id, exitPrice });
}, []);

const closeAllPositions = useCallback(async (closePrices: Record<string, number>) => {
  await sendTradingRequest({ action: 'closeAll', closePrices });
}, []);

// =====================================================
// 11. WALLET DEPOSIT
// =====================================================

const handleDeposit = useCallback(
(amount: number, method: string) => {

setWalletBalance((balance) => balance + amount);

  setTransactions((prev) => [
    makeTx('DEPOSIT', amount, method, 'COMPLETED'),
    ...prev
  ]);

},
[setWalletBalance, setTransactions]

);

// =====================================================
// 12. WALLET WITHDRAW
// =====================================================

const handleWithdraw = useCallback(
(amount: number, method: string) => {

setWalletBalance((balance) =>
    Math.max(0, balance - amount)
  );

  setTransactions((prev) => [
    makeTx('WITHDRAW', amount, method, 'PENDING'),
    ...prev
  ]);

},
[setWalletBalance, setTransactions]

);

// =====================================================
// 13. APP UI
// =====================================================

return (
<>
{view === 'splash' ? (

<Splash onEnter={handleEnter} />

  ) : (

    <>
      <Ticker livePrices={{}} />

      <Dashboard
        activeTab={activeTab}
        onTabChange={setActiveTab}

        walletBalance={walletBalance}

        watchlist={watchlist}

        positions={positions}
        tradeHistory={tradeHistory}
        historyLoading={tradeHistoryLoading}
        historyError={tradeHistoryError}
        transactions={transactions}

        onToggleWatch={toggleWatch}
        onRemoveWatch={removeWatch}

        onOpenPosition={openPosition}
        onClosePosition={closePosition}
        onCloseAllPositions={closeAllPositions}

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

function App() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  if (pathname !== '/source') return <TradingApp />;

  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-600" role="status" aria-live="polite">
          Loading source files…
        </main>
      }
    >
      <SourceBrowser />
    </Suspense>
  );
}

export default App;
```

## `Project/src/components/Dashboard.tsx`

```tsx

import { useMemo, useState, useCallback } from 'react';

import { INSTRUMENTS, getInstrument } from '@/data/instruments';
import { DERIVATIVE_CONTRACTS } from '@/data/derivatives';

import { CandleChart } from '@/components/CandleChart';
import { ContractBrowser } from '@/components/ContractBrowser';
import { TradePanel } from '@/components/TradePanel';
import { PositionsPanel } from '@/components/PositionsPanel';
import { WalletPanel } from '@/components/WalletPanel';
import { WatchlistPanel } from '@/components/WatchlistPanel';
import { Navbar } from '@/components/Navbar';

import { useSelectedMarketFeed } from '@/hooks/useSelectedMarketFeed';
import type { MarketTick } from '@/lib/marketData';
import { fmtINR } from '@/lib/format';

import type { DashboardTab, Position, TradeHistoryEntry, WalletTx } from '@/types';

interface DashboardProps {
  activeTab: DashboardTab;
  onTabChange: (t: DashboardTab) => void;
  walletBalance: number;
  watchlist: any[];
  positions: Position[];
  tradeHistory: TradeHistoryEntry[];
  historyLoading: boolean;
  historyError: string | null;
  transactions: WalletTx[];
  onToggleWatch: (contract: any) => void;
  onRemoveWatch: (contract: any) => void;
  onOpenPosition: (p: Position) => Promise<void>;
  onClosePosition: (id: string, exitPrice: number) => Promise<void>;
  onCloseAllPositions: (closePrices: Record<string, number>) => Promise<void>;
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
    tradeHistory,
    historyLoading,
    historyError,
    transactions,
    onToggleWatch,
    onRemoveWatch,
    onOpenPosition,
    onClosePosition,
    onCloseAllPositions,
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

  const selectedInstrument = useMemo(() => {
    return (
      getInstrument(selected) ||
      DERIVATIVE_CONTRACTS.find((item: any) => item.symbol === selected) ||
      INSTRUMENTS.find((item: any) => item.symbol === selected) ||
      INSTRUMENTS[0] ||
      DERIVATIVE_CONTRACTS[0] ||
      { symbol: DEFAULT_SYMBOL, price: 0 }
    );
  }, [selected]);

  const activeContract = useMemo(() => {
    if (selectedContract?.symbol === selected) return selectedContract;

    return (
      DERIVATIVE_CONTRACTS.find((item: any) => item.symbol === selected) ||
      INSTRUMENTS.find((item: any) => item.symbol === selected) ||
      selectedInstrument
    );
  }, [selected, selectedContract, selectedInstrument]);

  const basePrice = Math.max(
    0,
    Number(activeContract?.price ?? selectedInstrument?.price ?? 0) || 0
  );
  const marketFeed = useSelectedMarketFeed(activeContract, basePrice);
  const livePrice = marketFeed.livePrice;
  const livePrices = useMemo(
    () => livePrice > 0 ? { [selected]: livePrice } : {},
    [livePrice, selected]
  );

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
            ticks={marketFeed.ticks}
            marketDataConnected={marketFeed.connected}
            hasLivePrice={marketFeed.hasLivePrice}
            watchlist={watchlist}
            onToggleWatch={onToggleWatch}
            onRemoveWatch={onRemoveWatch}
            walletBalance={walletBalance}
            onOpenPosition={onOpenPosition}
          positions={positions}
          tradeHistory={tradeHistory}
          historyLoading={historyLoading}
          historyError={historyError}
          onClosePosition={onClosePosition}
            onCloseAllPositions={onCloseAllPositions}
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
                history={tradeHistory}
                historyLoading={historyLoading}
                historyError={historyError}
                livePrices={livePrices}
                onClose={onClosePosition}
                onCloseAll={onCloseAllPositions}
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
                ticks={marketFeed.ticks}
                connected={marketFeed.connected}
              />
            </div>

            <div className="space-y-6">

              <PositionsPanel
                positions={positions}
                history={tradeHistory}
                historyLoading={historyLoading}
                historyError={historyError}
                livePrices={livePrices}
                onClose={onClosePosition}
                onCloseAll={onCloseAllPositions}
              />

              <WatchlistPanel
                watchlist={watchlist}
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
              <a href="/source" className="mt-3 inline-flex text-xs font-semibold text-accent hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                Browse source files
              </a>
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
  ticks: MarketTick[];
  marketDataConnected: boolean;
  hasLivePrice: boolean;
  watchlist: any[];
  onToggleWatch: (contract: any) => void;
  onRemoveWatch: (contract: any) => void;
  walletBalance: number;
  onOpenPosition: (p: Position) => Promise<void>;
  positions: Position[];
  tradeHistory: TradeHistoryEntry[];
  historyLoading: boolean;
  historyError: string | null;
  onClosePosition: (id: string, exitPrice: number) => Promise<void>;
  onCloseAllPositions: (closePrices: Record<string, number>) => Promise<void>;
}) {
  const {
    selected,
    selectedContract,
    onSelect,
    livePrices,
    basePrice,
    livePrice,
    ticks,
    marketDataConnected,
    hasLivePrice,
    watchlist,
    onToggleWatch,
    onRemoveWatch,
    walletBalance,
    onOpenPosition,
    positions,
    tradeHistory,
    historyLoading,
    historyError,
    onClosePosition,
    onCloseAllPositions,
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
            ticks={ticks}
            connected={marketDataConnected}
          />
        </div>

        <div className="space-y-6">

          <TradePanel
            symbol={selected}
            contract={selectedContract}
            livePrice={livePrice}
            hasLivePrice={hasLivePrice}
            marketDataConnected={marketDataConnected}
            walletBalance={walletBalance}
            onOpenPosition={onOpenPosition}
          />

          <WatchlistPanel
            watchlist={watchlist}
            onSelect={onSelect}
            onRemove={onRemoveWatch}
            selected={selected}
          />

          <PositionsPanel
            positions={positions}
            history={tradeHistory}
            historyLoading={historyLoading}
            historyError={historyError}
            livePrices={livePrices}
            onClose={onClosePosition}
            onCloseAll={onCloseAllPositions}
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
```

## `Project/src/components/TradePanel.tsx`

```tsx
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  Zap,
  ArrowUpCircle,
  ArrowDownCircle,
  Info
} from 'lucide-react';

import { getInstrument } from '@/data/instruments';
import { fmtINR, fmtNum, uid } from '@/lib/format';
import {
  calculateMargin,
  calculateNotional,
  calculateOptionSellMargin,
  getContractMultiplier,
  getGoldContractGrams,
  getPricePerGram,
} from '@/lib/tradingMath';
import { fetchUpstoxMargin, type MarginRequest, type MarginResult } from '@/lib/upstox';
import { getMarketStatus, MARKET_CLOSED_MESSAGE } from '@/lib/marketHours';

import {
  type OrderSide,
  type OrderType,
  type Position,
} from '@/types';

interface TradePanelProps {
  symbol: string;
  livePrice: number;
  hasLivePrice: boolean;
  marketDataConnected: boolean;
  walletBalance: number;
  onOpenPosition: (p: Position) => Promise<void>;
  contract?: any;
}

type ProductType = 'INTRADAY' | 'DELIVERY';

export function TradePanel({
  symbol,
  livePrice,
  hasLivePrice,
  marketDataConnected,
  walletBalance,
  onOpenPosition,
  contract
}: TradePanelProps) {

  const staticInst = getInstrument(symbol);

  // =========================================
  // CONTRACT METADATA
  // =========================================

  const exchange = String(
    contract?.exch_seg ||
    contract?.exchange ||
    staticInst?.exchange ||
    'NSE'
  );

  const name =
    contract?.name ||
    staticInst?.name ||
    symbol;

  const token = String(contract?.token || '');

  const lotSize = Math.max(
    1,
    Number(
      contract?.lotsize ||
      contract?.lotSize ||
      staticInst?.lotSize ||
      1
    ) || 1
  );

  const instrumentKey =
    contract?.instrumentKey ||
    (token ? `${exchange}|${token}` : '');

  const isMcx = exchange.toUpperCase().includes('MCX');

  const availableLevs = isMcx
    ? [10, 25, 50, 100, 200, 300, 400, 500]
    : [1, 2, 3, 5, 7, 10];

  const defaultLev = isMcx ? 100 : 5;

  // =========================================
  // STATES
  // =========================================

  const [leverage, setLeverage] = useState<number>(defaultLev);

  const [side, setSide] = useState<OrderSide>('BUY');

  const [orderType, setOrderType] =
    useState<OrderType>('MARKET');

  const [product, setProduct] =
    useState<ProductType>('INTRADAY');

  const [currentLtp, setCurrentLtp] =
    useState<number>(livePrice || 0);

  const [limitPrice, setLimitPrice] =
    useState<string>(fmtNum(livePrice || 0));

  const [lots, setLots] = useState<string>('1');

  const [error, setError] = useState<string | null>(null);

  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [marketNow, setMarketNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setMarketNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const marketStatus = useMemo(
    () => getMarketStatus(exchange, marketNow),
    [exchange, marketNow]
  );

  useEffect(() => {
    const nextPrice = Number.isFinite(livePrice) && livePrice > 0 ? livePrice : 0;
    setCurrentLtp(nextPrice);
    if (orderType === 'MARKET') setLimitPrice(fmtNum(nextPrice));
  }, [livePrice, orderType]);

  useEffect(() => {
    setLeverage(defaultLev);
    setLots('1');
    setSide('BUY');
    setOrderType('MARKET');
    setProduct('INTRADAY');
    setError(null);
    setSuccess(null);
    const nextPrice = Number.isFinite(livePrice) && livePrice > 0 ? livePrice : 0;
    setCurrentLtp(nextPrice);
    setLimitPrice(fmtNum(nextPrice));
  }, [symbol, token, exchange, defaultLev]);

  const contractGrams = getGoldContractGrams(symbol);
  const isGoldContract = contractGrams > 0;
  const optionKind = contract?.kind === 'CE' || contract?.kind === 'PE'
    ? contract.kind
    : undefined;
  const isOptionContract = optionKind !== undefined;
  const isOptionSell = side === 'SELL' && isOptionContract;
  const lotDescription = isGoldContract
    ? `(1 Lot = ${contractGrams}g)`
    : lotSize > 1
      ? `(1 Lot = ${lotSize})`
      : '';

  // =========================================
  // APK PRICE OFFSET
  // =========================================

  function getPriceOffset(sym: string): number {
    const upper = sym.toUpperCase();

    if (upper.includes('GOLD')) return 5;

    if (
      upper.includes('NATGAS') ||
      upper.includes('NATURAL')
    ) {
      return 0.1;
    }

    if (
      upper.includes('CRUDEOIL') ||
      upper.includes('CRUDE')
    ) {
      return 2;
    }

    return 1;
  }

  const priceOffset = getPriceOffset(symbol);

  const adjustedMarketPrice = useMemo(() => {
    if (currentLtp <= 0) return 0;

    if (side === 'BUY') {
      return currentLtp + priceOffset;
    }

    return currentLtp >= priceOffset
      ? currentLtp - priceOffset
      : currentLtp;

  }, [currentLtp, side, priceOffset]);

  // =========================================
  // QUANTITY & GRAMS CALCULATION FIX
  // =========================================

  const lotsNum = Math.max(
    1,
    parseInt(lots, 10) || 1
  );

  const gramsPerLot = contractGrams;
  const totalGrams = lotsNum * gramsPerLot;
  const totalUnits = lotsNum * (isGoldContract ? 1 : lotSize);
  const displayQuantity = isGoldContract
    ? `${totalGrams.toLocaleString('en-IN')}g`
    : `${totalUnits.toLocaleString('en-IN')} units`;

  // =========================================
  // EFFECTIVE ORDER PRICE
  // =========================================

  const effectivePrice =
    orderType === 'MARKET'
      ? adjustedMarketPrice
      : Math.max(0, parseFloat(limitPrice) || 0);

  // =========================================
  // SHARED POSITION NOTIONAL AND MARGIN (Grams × Per Gram Price)
  // =========================================

  const notional = useMemo(() => {
    if (effectivePrice <= 0) return 0;
    return calculateNotional(symbol, effectivePrice, totalUnits);
  }, [symbol, effectivePrice, totalUnits]);

  const safeLeverage = Number.isFinite(leverage) && leverage > 0 ? leverage : 1;
  const fallbackMargin = calculateMargin(notional, safeLeverage);
  const marginRequest = useMemo<MarginRequest | null>(() => {
    if (isOptionSell || !instrumentKey || effectivePrice <= 0 || totalUnits <= 0) return null;
    return {
      instrumentKey,
      quantity: totalUnits,
      transactionType: side,
      product: product === 'DELIVERY' ? 'D' : 'I',
      price: effectivePrice,
    };
  }, [instrumentKey, effectivePrice, totalUnits, side, product, isOptionSell]);

  const { data: marginData, error: marginError, isLoading: marginLoading } = useSWR<MarginResult>(
    marginRequest ? ['upstox-margin', marginRequest] : null,
    ([, request]) => fetchUpstoxMargin(request as MarginRequest),
    { keepPreviousData: false, revalidateOnFocus: false }
  );
  const liveMarginValue = marginData?.finalMargin;
  const hasLiveMargin =
    !marginLoading &&
    !marginError &&
    typeof liveMarginValue === 'number' &&
    Number.isFinite(liveMarginValue) &&
    liveMarginValue >= 0;
  const requiredMargin = isOptionSell
    ? calculateOptionSellMargin(lotsNum)
    : hasLiveMargin && liveMarginValue !== undefined
      ? liveMarginValue
      : fallbackMargin;

  // =========================================
  // MAX LOTS BY BALANCE
  // =========================================

  const maxLotsByBalance = useMemo(() => {
    if (isOptionSell) {
      return Math.floor(walletBalance / calculateOptionSellMargin(1));
    }
    if (!walletBalance || effectivePrice <= 0 || leverage <= 0) {
      return 0;
    }

    const costPerLot = isGoldContract
      ? gramsPerLot * getPricePerGram(symbol, effectivePrice)
      : effectivePrice * lotSize;
    if (costPerLot <= 0) return 0;

    return Math.floor((walletBalance * leverage) / costPerLot);
  }, [
    walletBalance,
    leverage,
    effectivePrice,
    isOptionSell,
    isGoldContract,
    gramsPerLot,
    lotSize,
    symbol,
  ]);

  // =========================================
  // ORDER SUBMIT
  // =========================================

  async function handleSubmit() {
    setError(null);
    setSuccess(null);

    const currentMarketStatus = getMarketStatus(exchange, new Date());
    if (!currentMarketStatus.isOpen) {
      setError(MARKET_CLOSED_MESSAGE);
      return;
    }

    if (!hasLivePrice || !marketDataConnected) {
      setError(marketDataConnected ? 'Waiting for a live market price.' : 'Live market data is disconnected.');
      return;
    }

    if (!token) {
      setError('Contract token missing. Please select the contract again.');
      return;
    }

    if (!currentLtp || currentLtp <= 0) {
      setError('Live market price is not available.');
      return;
    }

    if (!Number.isFinite(lotsNum) || lotsNum <= 0) {
      setError('Enter a valid lots quantity.');
      return;
    }

    if (lotsNum > maxLotsByBalance) {
      setError(`Maximum available quantity is ${maxLotsByBalance} lots.`);
      return;
    }

    if (orderType === 'LIMIT') {
      const parsedLimit = parseFloat(limitPrice);
      if (!limitPrice || !Number.isFinite(parsedLimit) || parsedLimit <= 0) {
        setError('Enter a valid limit price.');
        return;
      }
    }

    if (!hasLiveMargin && !isOptionSell) {
      setError(marginError instanceof Error ? marginError.message : 'Waiting for the live Upstox margin calculation.');
      return;
    }

    if (requiredMargin > walletBalance) {
      setError(`Insufficient balance. Margin required ${fmtINR(requiredMargin)}, available ${fmtINR(walletBalance)}.`);
      return;
    }

    const positionData = {
      id: uid('pos'),
      symbol,
      name,
      token,
      instrumentKey,
      exchange,
      exch_seg: contract?.exch_seg || exchange,
      strike: contract?.strike ?? null,
      expiry: contract?.expiry ?? contract?.rawExpiry ?? null,
      lots: lotsNum,
      lotSize,
      kind: optionKind,
      lotsize: String(lotSize),
      qty: totalUnits,
      side,
      orderType,
      product,
      entryPrice: effectivePrice,
      currentPrice: currentLtp,
      leverage: `${leverage}X`,
      margin: requiredMargin,
      notional,
      contractMultiplier: getContractMultiplier(symbol),
      buy_price: effectivePrice,
      margin_blocked: requiredMargin,
      status: 'OPEN',
      instrumenttype: contract?.instrumenttype ?? contract?.kind ?? '',
      tick_size: contract?.tick_size ?? null,
      timestamp: Date.now(),
    };

    setIsSubmitting(true);
    try {
      await onOpenPosition(positionData as Position);
      setSuccess(`${side} ${displayQuantity} (${lotsNum} ${lotsNum === 1 ? 'lot' : 'lots'}) of ${symbol} @ ${fmtNum(effectivePrice)} (${leverage}x) ${product} placed.`);
      setTimeout(() => setSuccess(null), 3500);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The order could not be placed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const insufficient =
    requiredMargin > walletBalance ||
    maxLotsByBalance < lotsNum;
  const liveFeedLabel = hasLivePrice
    ? marketDataConnected ? 'Live LTP' : 'Last quote'
    : marketDataConnected ? 'Waiting for ticks' : 'Connecting';

  // =========================================
  // UI
  // =========================================

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">

      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg font-bold text-white">
          Trade Order
        </h3>

        <span className="rounded-md bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
          {exchange}
        </span>
      </div>

      {/* Symbol + LTP Header */}

      <div className="mb-4 rounded-xl border border-white/5 bg-black/40 p-3">
        <div className="flex items-center justify-between">

          <div className="min-w-0 pr-2">
            <div className="text-sm font-semibold text-white truncate">
              {symbol}
            </div>

            <div className="text-[11px] text-gray-400 truncate">
              {name} {lotDescription}
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="font-mono text-base font-semibold text-white">
              {currentLtp > 0 ? fmtNum(currentLtp) : '0.00'}
            </div>

            <div className={`text-[11px] font-mono flex items-center justify-end gap-1 ${hasLivePrice ? 'text-emerald-400' : 'text-amber-300'}`} role="status" aria-live="polite">
              <span className={`h-1.5 w-1.5 rounded-full ${hasLivePrice && marketDataConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-300'}`} />
              {liveFeedLabel}
            </div>
          </div>

        </div>
      </div>

      {!marketStatus.isOpen && (
        <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-xs text-amber-200" role="status" aria-live="polite">
          <p className="font-semibold">{MARKET_CLOSED_MESSAGE}</p>
          <p className="mt-1 text-[11px] text-amber-100/70">{exchange} session: {marketStatus.sessionLabel}</p>
        </div>
      )}

      {/* Side toggle */}

      <div className="mb-4 grid grid-cols-2 gap-2">

        <button
          type="button"
          disabled={!marketStatus.isOpen}
          aria-pressed={side === 'BUY'}
          title={!marketStatus.isOpen ? MARKET_CLOSED_MESSAGE : undefined}
          onClick={() => setSide('BUY')}
          className={`flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
            side === 'BUY'
              ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
              : 'bg-black/40 text-gray-400 hover:text-white border border-white/5'
          }`}
        >
          <ArrowUpCircle className="h-4 w-4" />
          BUY
        </button>

        <button
          type="button"
          disabled={!marketStatus.isOpen}
          aria-pressed={side === 'SELL'}
          title={!marketStatus.isOpen ? MARKET_CLOSED_MESSAGE : undefined}
          onClick={() => setSide('SELL')}
          className={`flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
            side === 'SELL'
              ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20'
              : 'bg-black/40 text-gray-400 hover:text-white border border-white/5'
          }`}
        >
          <ArrowDownCircle className="h-4 w-4" />
          SELL
        </button>

      </div>

      {/* Order type */}

      <div className="mb-4 flex items-center gap-1 rounded-lg border border-white/5 bg-black/40 p-1">

        {(['MARKET', 'LIMIT'] as OrderType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setOrderType(t)}
            className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              orderType === t
                ? 'bg-accent text-white'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {t}
          </button>
        ))}

      </div>

      {/* Product type */}

      <div className="mb-4">
        <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-gray-500">
          Product
        </label>

        <div className="grid grid-cols-2 gap-2">

          {(['INTRADAY', 'DELIVERY'] as ProductType[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProduct(p)}
              className={`rounded-lg py-2.5 text-xs font-bold transition-all cursor-pointer ${
                product === p
                  ? 'bg-gold text-black gold-glow'
                  : 'bg-black/40 text-gray-400 border border-white/5 hover:text-white'
              }`}
            >
              {p}
            </button>
          ))}

        </div>
      </div>

      {/* Limit price */}

      {orderType === 'LIMIT' && (
        <div className="mb-4">

          <label className="mb-1 block text-[11px] uppercase tracking-wider text-gray-500">
            Limit Price
          </label>

          <input
            type="number"
            min="0"
            value={limitPrice}
            onChange={(e) => setLimitPrice(e.target.value)}
            className="w-full rounded-lg border border-white/5 bg-black/40 px-3 py-2 font-mono text-sm text-white focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
          />

        </div>
      )}

      {/* Quantity & Lots */}

      <div className="mb-4 grid grid-cols-2 gap-3">

        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wider text-gray-400 font-medium">
            LOTS
          </label>

          <input
            type="number"
            min="1"
            value={lots}
            onChange={(e) => setLots(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2.5 font-mono text-base text-white focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30 text-center font-bold"
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wider text-gold font-medium">
            {isGoldContract ? 'TOTAL WEIGHT (G)' : 'TOTAL QTY (UNITS)'}
          </label>

          <div className="w-full rounded-lg border border-gold/40 bg-gold/10 px-3 py-2.5 font-mono text-base text-gold text-center font-bold flex items-center justify-center shadow-inner">
            {isGoldContract ? `${totalGrams.toLocaleString('en-IN')}g` : totalUnits.toLocaleString('en-IN')}
          </div>
        </div>

      </div>

      <div className="mb-4 -mt-2 flex items-center justify-between text-[11px]">
        <span className="text-gray-500">
          Max Lots: {maxLotsByBalance.toLocaleString('en-IN')}
        </span>

        <span className="text-gold font-bold">
          {isGoldContract
            ? `${lotsNum} lots × ${gramsPerLot}g = ${totalGrams}g`
            : `1 Lot = ${lotSize} units`}
        </span>
      </div>

      {/* Leverage */}

      <div className="mb-4">

        <div className="mb-1.5 flex items-center justify-between">

          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-gold" />

            <span className="text-[11px] uppercase tracking-wider text-gray-500">
              Leverage
            </span>
          </div>

          <span className="text-[10px] text-gray-400">
            {isMcx
              ? 'MCX Commodity · up to 500X'
              : 'Equity/FO · up to 10X'}
          </span>

        </div>

        <div className={`grid gap-1.5 ${
          availableLevs.length > 6
            ? 'grid-cols-4'
            : 'grid-cols-3'
        }`}>

          {availableLevs.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLeverage(l)}
              className={`rounded-lg py-2 text-xs font-bold transition-all cursor-pointer ${
                leverage === l
                  ? 'bg-gold text-black gold-glow'
                  : 'bg-black/40 text-gray-400 hover:text-gold border border-white/5'
              }`}
            >
              {l}x
            </button>
          ))}

        </div>
      </div>

      {/* Summary */}

      <div className="mb-4 space-y-1.5 rounded-xl border border-white/5 bg-black/40 p-3 text-xs">

        <Row
          label="LTP"
          value={fmtINR(currentLtp)}
        />

        <Row
          label="Order Price"
          value={fmtINR(effectivePrice)}
        />

        <Row
          label="Price Offset"
          value={fmtINR(priceOffset)}
        />

        <Row
          label="Notional Value"
          value={fmtINR(notional)}
        />

        <Row
          label={`Required Margin (${side})`}
          value={fmtINR(requiredMargin)}
          highlight={insufficient ? 'text-rose-400' : 'text-white'}
        />

        <Row
          label="Available Balance"
          value={fmtINR(walletBalance)}
        />

      </div>

      {/* Messages */}

      {error && (
        <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          {success}
        </div>
      )}

      {/* Submit */}

      <div className={`mb-2 rounded-lg border px-3 py-2 text-center text-xs ${
        insufficient ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' : 'border-white/10 bg-black/30 text-gray-300'
      }`}>
        {isOptionSell
          ? `Option sell margin: ${fmtINR(requiredMargin)} (${lotsNum} ${lotsNum === 1 ? 'lot' : 'lots'} × ${fmtINR(calculateOptionSellMargin(1))}/lot)`
          : hasLiveMargin
            ? `${side} margin required: ${fmtINR(requiredMargin)}`
            : `${side} estimated margin: ${fmtINR(requiredMargin)} (Notional ÷ Leverage)`}
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={
          !marketStatus.isOpen ||
          !hasLivePrice ||
          !marketDataConnected ||
          isSubmitting ||
          (!hasLiveMargin && !isOptionSell) ||
          insufficient ||
          lotsNum <= 0 ||
          currentLtp <= 0 ||
          !token
        }
        className={`w-full rounded-xl py-3.5 text-sm font-bold transition-all cursor-pointer ${
          side === 'BUY'
            ? 'bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-40 shadow-lg shadow-emerald-500/20'
            : 'bg-rose-500 text-white hover:bg-rose-400 disabled:opacity-40 shadow-lg shadow-rose-500/20'
        }`}
      >
        {isSubmitting ? 'Submitting order…' : `${side} ${displayQuantity} ${symbol} @ ${fmtNum(effectivePrice)}`}
      </button>

      <div className="mt-3 flex items-start gap-1.5 text-[10px] text-gray-500">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />

        <span>
          Simulated trading environment. Margin and position updates are validated by the server.
        </span>
      </div>

    </div>
  );
}


function Row({
  label,
  value,
  highlight = 'text-white',
}: {
  label: string;
  value: string;
  highlight?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">
        {label}
      </span>

      <span className={`font-mono ${highlight}`}>
        {value}
      </span>
    </div>
  );
}
```

## `Project/src/components/CandleChart.tsx`

```tsx
import { useEffect, useMemo, useState } from 'react';
import { aggregateTicksToCandles } from '@/lib/chartData';
import { fmtNum } from '@/lib/format';
import type { MarketTick } from '@/lib/marketData';
import { TIMEFRAMES, type Candle, type Timeframe } from '@/types';

interface CandleChartProps {
  symbol: string;
  basePrice: number;
  livePrice: number;
  ticks: MarketTick[];
  connected: boolean;
}

export function CandleChart({
  symbol,
  basePrice,
  livePrice,
  ticks,
  connected,
}: CandleChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>('15M');
  const [hover, setHover] = useState<Candle | null>(null);
  const candles = useMemo(
    () => aggregateTicksToCandles(ticks, timeframe),
    [ticks, timeframe]
  );

  useEffect(() => {
    setHover(null);
  }, [symbol, timeframe]);

  // Layout constants
  const W = 760;
  const H = 360;
  const padR = 62;
  const padB = 28;
  const padT = 12;
  const padL = 8;
  const chartW = W - padR - padL;
  const chartH = H - padB - padT;

  const { min, max } = useMemo(() => {
    if (candles.length === 0) {
      const anchor = livePrice > 0 ? livePrice : basePrice > 0 ? basePrice : 1;
      const padding = Math.max(Math.abs(anchor) * 0.005, 0.01);
      return { min: anchor - padding, max: anchor + padding };
    }

    const lo = Math.min(...candles.map((candle) => candle.low));
    const hi = Math.max(...candles.map((candle) => candle.high));
    const padding = Math.max((hi - lo) * 0.08, Math.abs(hi) * 0.002, 0.01);
    return { min: lo - padding, max: hi + padding };
  }, [candles, basePrice, livePrice]);

  const range = max - min || 1;
  const n = Math.max(candles.length, 1);
  const slot = chartW / n;
  const bodyW = Math.max(2, slot * 0.62);

  const y = (price: number) => padT + chartH - ((price - min) / range) * chartH;
  const x = (i: number) => padL + i * slot + slot / 2;

  // Gridlines (5 horizontal)
  const gridLines = useMemo(() => {
    const lines: { y: number; price: number }[] = [];
    for (let i = 0; i <= 4; i++) {
      const price = min + (range * i) / 4;
      lines.push({ y: y(price), price });
    }
    return lines;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [min, max, range]);

  const chartClose = candles.length ? candles[candles.length - 1].close : 0;
  const lastPrice = livePrice > 0 ? livePrice : chartClose;
  const firstPrice = candles.length ? candles[0].close : lastPrice;
  const sessionChange = firstPrice > 0 ? lastPrice - firstPrice : 0;
  const sessionChangePct = firstPrice > 0 ? (sessionChange / firstPrice) * 100 : 0;
  const up = sessionChange >= 0;
  const hasPrice = lastPrice > 0;

  // Area path under close line for subtle fill
  const areaPath = useMemo(() => {
    if (!candles.length) return '';
    let d = `M ${x(0)} ${y(candles[0].close)}`;
    for (let i = 1; i < candles.length; i++) {
      d += ` L ${x(i)} ${y(candles[i].close)}`;
    }
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, min, max]);

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-baseline gap-3">
          <h3 className="font-display text-lg font-bold text-white">{symbol}</h3>
          <span
            className={`font-mono text-sm ${hasPrice ? up ? 'text-emerald-400' : 'text-rose-400' : 'text-gray-500'}`}
          >
            {hasPrice ? fmtNum(lastPrice) : '—'}
          </span>
          {candles.length > 0 && (
            <span
              className={`text-xs font-medium ${up ? 'text-emerald-400' : 'text-rose-400'}`}
            >
              {up ? '▲' : '▼'} {fmtNum(Math.abs(sessionChange))} (
              {sessionChangePct >= 0 ? '+' : ''}
              {sessionChangePct.toFixed(2)}%)
            </span>
          )}
        </div>
        <div className={`flex items-center gap-1.5 text-[10px] ${connected && hasPrice ? 'text-emerald-400' : 'text-amber-300'}`} role="status" aria-live="polite">
          <span className={`h-1.5 w-1.5 rounded-full ${connected && hasPrice ? 'bg-emerald-400 animate-pulse' : 'bg-amber-300'}`} />
          {connected && hasPrice ? 'Live stream' : connected ? 'Waiting for ticks' : 'Reconnecting'}
        </div>

        {/* Timeframe selector */}
        <div className="flex items-center gap-1 rounded-lg border border-white/5 bg-black/40 p-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              title={`${tf} candles aggregated from live ticks`}
              aria-label={`Show ${tf} live candles`}
              aria-pressed={timeframe === tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                timeframe === tf
                  ? 'bg-accent text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Live ${timeframe} candlestick chart for ${symbol}`}
          onMouseLeave={() => setHover(null)}
        >
          {/* Gridlines + price axis */}
          {gridLines.map((g, i) => (
            <g key={i}>
              <line
                x1={padL}
                y1={g.y}
                x2={padL + chartW}
                y2={g.y}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth={1}
              />
              <text
                x={padL + chartW + 6}
                y={g.y + 3}
                fill="rgba(255,255,255,0.45)"
                fontSize={10}
                fontFamily="JetBrains Mono, monospace"
              >
                {fmtNum(g.price)}
              </text>
            </g>
          ))}

          {candles.length > 0 && (
            <>
              {/* Area fill */}
              <path
                d={`${areaPath} L ${x(n - 1)} ${padT + chartH} L ${x(0)} ${padT + chartH} Z`}
                fill={up ? 'rgba(16,185,129,0.07)' : 'rgba(244,63,94,0.07)'}
              />
              <path
                d={areaPath}
                fill="none"
                stroke={up ? 'rgba(16,185,129,0.35)' : 'rgba(244,63,94,0.35)'}
                strokeWidth={1}
              />
            </>
          )}

          {/* Candles */}
          {candles.map((c, i) => {
            const cx = x(i);
            const isUp = c.close >= c.open;
            const color = isUp ? '#10b981' : '#f43f5e';
            const yO = y(c.open);
            const yC = y(c.close);
            const top = Math.min(yO, yC);
            const h = Math.max(1, Math.abs(yC - yO));
            return (
              <g
                key={i}
                onMouseEnter={() => setHover(c)}
              >
                {/* hover highlight */}
                <rect
                  x={cx - slot / 2}
                  y={padT}
                  width={slot}
                  height={chartH}
                  fill={hover === c ? 'rgba(255,255,255,0.03)' : 'transparent'}
                />
                {/* wick */}
                <line
                  x1={cx}
                  y1={y(c.high)}
                  x2={cx}
                  y2={y(c.low)}
                  stroke={color}
                  strokeWidth={1}
                  opacity={0.9}
                />
                {/* body */}
                <rect
                  x={cx - bodyW / 2}
                  y={top}
                  width={bodyW}
                  height={h}
                  fill={color}
                  rx={0.5}
                />
              </g>
            );
          })}

          {hasPrice && (
            <>
              {/* Live price line */}
              <line
                x1={padL}
                y1={y(lastPrice)}
                x2={padL + chartW}
                y2={y(lastPrice)}
                stroke={up ? '#10b981' : '#f43f5e'}
                strokeWidth={1}
                strokeDasharray="4 3"
                opacity={0.6}
              />
              <rect
                x={padL + chartW + 2}
                y={y(lastPrice) - 8}
                width={padR - 4}
                height={16}
                rx={3}
                fill={up ? '#10b981' : '#f43f5e'}
              />
              <text
                x={padL + chartW + 6}
                y={y(lastPrice) + 3}
                fill="#000"
                fontSize={9}
                fontWeight={600}
                fontFamily="JetBrains Mono, monospace"
              >
                {fmtNum(lastPrice)}
              </text>
            </>
          )}
        </svg>

        {candles.length === 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center text-xs text-gray-500" role="status" aria-live="polite">
            {connected ? 'Waiting for live ticks to build candles…' : 'Connecting to the live market feed…'}
          </div>
        )}

        {/* Hover tooltip */}
        {hover && (
          <div className="pointer-events-none absolute top-2 left-2 rounded-lg border border-white/10 bg-black/80 px-3 py-2 text-[11px] font-mono backdrop-blur">
            <div className="flex gap-3 text-gray-300">
              <span>O <span className="text-white">{fmtNum(hover.open)}</span></span>
              <span>H <span className="text-emerald-400">{fmtNum(hover.high)}</span></span>
              <span>L <span className="text-rose-400">{fmtNum(hover.low)}</span></span>
              <span>C <span className="text-white">{fmtNum(hover.close)}</span></span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

## `Project/src/components/ContractBrowser.tsx`

```tsx

import { ChevronDown, Plus, Search, Star, BarChart2 } from 'lucide-react';
import { useMemo, useState, useEffect, useRef } from 'react';
import type { DerivativeKind, Exchange } from '@/types';
import { RENDER_WS_URL } from '@/lib/marketData';

const DB_FILE_URL =
  'https://fnfynhgkdevxytxtfzrk.supabase.co/storage/v1/object/public/myt/angel_master.db';

interface ContractBrowserProps {
  selected: string;
  onSelect: (symbol: string) => void;
  onAddWatch: (contract: any) => void;
  watchlist: any[];
  onOpenChart?: (contract: any) => void;
}

type ExchangeFilter = Exchange | 'ALL';
type ContractFilter = DerivativeKind | 'ALL';

const exchanges: ExchangeFilter[] = ['ALL', 'NSE', 'BSE', 'MCX'];
const kinds: ContractFilter[] = ['ALL', 'FUT', 'CE', 'PE'];

function formatExpiryDate(rawExpiry: string): string {
  if (!rawExpiry) return '';
  if (/[a-zA-Z]/.test(rawExpiry)) return rawExpiry;

  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  const parts = rawExpiry.split('-');

  if (parts.length === 3) {
    const year = parts[0];
    const monthIndex = parseInt(parts[1], 10) - 1;
    const day = parts[2];

    if (monthIndex >= 0 && monthIndex < 12) {
      return `${day} ${monthNames[monthIndex]} ${year}`;
    }
  }

  return rawExpiry;
}

function formatSymbolName(rawSymbol: string): string {
  try {
    if (!rawSymbol) return '';

    const compact = rawSymbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const readableGoldNames: Record<string, string> = {
      GOLDGUNIA: 'GOLDGUNIA · 8g Gold',
      GOLDTEN: 'GOLDTEN · 10g Gold',
      GOLDM: 'GOLDM · 100g Gold',
      GOLD: 'GOLD · 1kg Gold',
    };
    for (const [key, label] of Object.entries(readableGoldNames)) {
      if (compact === key) return label;
    }

    const monthNames = [
      'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
      'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
    ];

    const upper = rawSymbol.toUpperCase();

    for (const month of monthNames) {
      if (upper.includes(month)) return rawSymbol;
    }

    const match2 = upper.match(/^([A-Z]+)(\d{2})(1[0-2])(\d{2})(.*)$/);

    if (match2) {
      const [, prefix, yy, mm, dd, rest] = match2;
      return `${prefix}${yy}${monthNames[parseInt(mm, 10) - 1]}${dd}${rest}`;
    }

    const match1 = upper.match(/^([A-Z]+)(\d{2})([1-9])(\d{2})(.*)$/);

    if (match1) {
      const [, prefix, yy, mm, dd, rest] = match1;
      return `${prefix}${yy}${monthNames[parseInt(mm, 10) - 1]}${dd}${rest}`;
    }

    const matchLetter = upper.match(/^([A-Z]+)(\d{2})([OND])(\d{2})(.*)$/);

    if (matchLetter) {
      const [, prefix, yy, monthLetter, dd, rest] = matchLetter;

      const monthMap: Record<string, string> = {
        O: 'OCT',
        N: 'NOV',
        D: 'DEC'
      };

      return `${prefix}${yy}${monthMap[monthLetter]}${dd}${rest}`;
    }
  } catch (error) {
    console.error('Format symbol error:', error);
  }

  return rawSymbol;
}

export function ContractBrowser({
  selected,
  onSelect,
  onAddWatch,
  watchlist,
  onOpenChart
}: ContractBrowserProps) {
  const [exchange, setExchange] = useState<ExchangeFilter>('NSE');
  const [kind, setKind] = useState<ContractFilter>('ALL');
  const [search, setSearch] = useState('');
  const [selectedExpiry, setSelectedExpiry] = useState<string>('ALL');
  const [expanded, setExpanded] = useState(true);

  const [dbInstance, setDbInstance] = useState<any>(null);
  const [rawContracts, setRawContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchlistRef = useRef<any[]>(watchlist);

  const pendingKeysRef = useRef<{
    keys: string[];
    tokens: string[];
  }>({ keys: [], tokens: [] });

  useEffect(() => {
    watchlistRef.current = watchlist;
  }, [watchlist]);

  // Watchlist ke complete contract data se subscriptions
  const sendSubscriptions = (ws: WebSocket) => {
    if (ws.readyState !== WebSocket.OPEN) return;

    const watchKeys = watchlistRef.current
      .map((item: any) => item?.instrumentKey || '')
      .filter(Boolean);

    const watchTokens = watchlistRef.current
      .map((item: any) => item?.token || '')
      .filter(Boolean);

    const searchKeys = pendingKeysRef.current.keys;
    const searchTokens = pendingKeysRef.current.tokens;

    const combinedKeys = Array.from(
      new Set([...searchKeys, ...watchKeys])
    );

    const combinedTokens = Array.from(
      new Set([...searchTokens, ...watchTokens])
    );

    const indexKeys = [
      'NSE_INDEX|Nifty 50',
      'BSE_INDEX|SENSEX'
    ];

    const instrumentKeys = Array.from(
      new Set([...indexKeys, ...combinedKeys])
    );

    ws.send(JSON.stringify({
      action: 'sub',
      guid: 'upstox_sub_request',
      instrumentKeys,
      tokens: combinedTokens
    }));

    console.log('ContractBrowser subscriptions:', {
      instrumentKeys,
      tokens: combinedTokens
    });
  };

  // Render WebSocket connection
  useEffect(() => {
    let disposed = false;

    const connectWS = () => {
      if (disposed) return;

      try {
        const ws = new WebSocket(RENDER_WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('ContractBrowser connected to Render WS');
          sendSubscriptions(ws);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('ContractBrowser WS:', data);
          } catch (error) {
            console.error('WS message parse error:', error);
          }
        };

        ws.onerror = (error) => {
          console.error('ContractBrowser WS error:', error);
        };

        ws.onclose = () => {
          if (!disposed) {
            reconnectTimerRef.current = setTimeout(connectWS, 3000);
          }
        };
      } catch (error) {
        console.error('WebSocket connection error:', error);

        if (!disposed) {
          reconnectTimerRef.current = setTimeout(connectWS, 3000);
        }
      }
    };

    connectWS();

    return () => {
      disposed = true;

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }

      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      sendSubscriptions(wsRef.current);
    }
  }, [watchlist]);

  // SQLite database load
  useEffect(() => {
    let cancelled = false;

    async function initDatabase() {
      try {
        setLoading(true);
        setErrorMsg(null);

        const response = await fetch(DB_FILE_URL, {
          cache: 'no-store'
        });

        if (!response.ok) {
          throw new Error(`DB Fetch failed: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const initSqlJs = (window as any).initSqlJs;

        if (!initSqlJs) {
          throw new Error('SQL.js not loaded in index.html');
        }

        const SQL = await initSqlJs({
          locateFile: (file: string) =>
            `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        });

        if (cancelled) return;

        const db = new SQL.Database(new Uint8Array(arrayBuffer));

        setDbInstance(db);
        setLoading(false);
      } catch (error: any) {
        console.error('DB Init Error:', error);

        if (!cancelled) {
          setErrorMsg(error?.message || 'Failed to load database');
          setLoading(false);
        }
      }
    }

    initDatabase();

    return () => {
      cancelled = true;
    };
  }, []);

  // Search contracts - SELECT * se database ke saare columns milenge
  const loadSymbolsFromDb = (
    db: any,
    exFilter: string,
    kindFilter: string,
    searchQuery: string
  ) => {
    try {
      setLoading(true);

      let sql = `
        SELECT *
        FROM symbols
        WHERE 1=1
      `;

      if (exFilter !== 'ALL') {
        if (exFilter === 'NSE') {
          sql += ` AND (
            exch_seg IN ('NSE', 'NFO', 'NSE_EQ', 'NSE_FO')
            OR exch_seg LIKE 'NSE%'
            OR exch_seg LIKE 'NFO%'
          )`;
        } else if (exFilter === 'BSE') {
          sql += ` AND (
            exch_seg IN ('BSE', 'BFO', 'BSE_EQ', 'BSE_FO')
            OR exch_seg LIKE 'BSE%'
            OR exch_seg LIKE 'BFO%'
          )`;
        } else if (exFilter === 'MCX') {
          sql += ` AND (
            exch_seg IN ('MCX', 'MCX_FO')
            OR exch_seg LIKE 'MCX%'
          )`;
        }
      }

      if (kindFilter === 'CE') {
        sql += ` AND (
          symbol LIKE '%CE'
          OR instrumenttype LIKE '%CE%'
          OR (
            instrumenttype LIKE '%OPT%'
            AND symbol NOT LIKE '%PE'
          )
        )`;
      } else if (kindFilter === 'PE') {
        sql += ` AND (
          symbol LIKE '%PE'
          OR instrumenttype LIKE '%PE%'
        )`;
      } else if (kindFilter === 'FUT') {
        sql += ` AND (
          instrumenttype LIKE '%FUT%'
          OR symbol LIKE '%FUT%'
          OR instrumenttype LIKE '%COM%'
          OR strike IS NULL
          OR strike = ''
          OR strike = '0.0'
        )
        AND symbol NOT LIKE '%CE'
        AND symbol NOT LIKE '%PE'`;
      }

      const rawInput = searchQuery.trim().toUpperCase();
      const safeInput = rawInput.replace(/'/g, "''");

      if (safeInput !== '') {
        const letters = safeInput.replace(/[^A-Z]/g, '');
        const digits = safeInput.replace(/[^0-9]/g, '');

        if (letters.length > 0 && digits.length > 0) {
          sql += ` AND (
            (symbol LIKE '%${letters}%' OR name LIKE '%${letters}%')
            AND
            (symbol LIKE '%${digits}%'
             OR strike LIKE '%${digits}%'
             OR name LIKE '%${digits}%')
          )`;
        } else if (letters.length > 0) {
          sql += ` AND (
            symbol LIKE '%${letters}%'
            OR name LIKE '%${letters}%'
          )`;
        } else if (digits.length > 0) {
          sql += ` AND (
            symbol LIKE '%${digits}%'
            OR strike LIKE '%${digits}%'
            OR name LIKE '%${digits}%'
          )`;
        }
      }

      sql += ` ORDER BY expiry ASC LIMIT 400;`;

      const result = db.exec(sql);

      if (result.length > 0) {
        const columns = result[0].columns;
        const values = result[0].values;

        const parsed = values.map((row: any) => {
          const rowData: Record<string, any> = {};

          columns.forEach((column: string, index: number) => {
            rowData[column] = row[index];
          });

          const rawSymbol = String(rowData.symbol || '');
          const formattedSymbol = formatSymbolName(rawSymbol);

          const instrumentType = String(rowData.instrumenttype || '');
          const upperType = instrumentType.toUpperCase();
          const upperSymbol = formattedSymbol.toUpperCase();

          let inferredKind: DerivativeKind = 'FUT';

          if (
            upperSymbol.endsWith('CE') ||
            upperType.includes('CE')
          ) {
            inferredKind = 'CE';
          } else if (
            upperSymbol.endsWith('PE') ||
            upperType.includes('PE')
          ) {
            inferredKind = 'PE';
          } else if (
            upperSymbol.includes('FUT') ||
            upperType.includes('FUT') ||
            upperType.includes('COM')
          ) {
            inferredKind = 'FUT';
          }

          const seg = String(rowData.exch_seg || '').toUpperCase();

          let inferredExchange: Exchange = 'NSE';

          if (seg.includes('BSE') || seg.includes('BFO')) {
            inferredExchange = 'BSE';
          } else if (seg.includes('MCX')) {
            inferredExchange = 'MCX';
          }

          const rawExpiry = String(rowData.expiry || '');
          const token = String(rowData.token || '');
          const lotsize = String(rowData.lotsize || '1');
          const tickSize = String(rowData.tick_size || '0.05');
          const rawName = String(rowData.name || '');

          const instrumentKey = `${seg || 'NSE'}|${token}`;

          const formattedName = formatSymbolName(
            rawName.trim() !== '' ? rawName : formattedSymbol
          );

          // Original database ke saare fields + normalized fields
          return {
            ...rowData,

            token,
            symbol: formattedSymbol,
            rawSymbol,
            name: formattedName,

            exchange: inferredExchange,
            exch_seg: seg || 'NSE',

            instrumentKey,
            instrument_key: instrumentKey,

            lotsize,
            lotSize: Number(lotsize) || 1,

            tick_size: tickSize,
            tickSize,

            instrumenttype: instrumentType,
            instrumentType,

            kind: inferredKind,

            rawExpiry,
            expiry: formatExpiryDate(rawExpiry),

            strike:
              rowData.strike && rowData.strike !== '0.0'
                ? Number(rowData.strike)
                : undefined,

            // Original SQLite row, including any extra/FII columns
            databaseData: { ...rowData }
          };
        });

        setRawContracts(parsed);

        const keys = parsed
          .map((item: any) => item.instrumentKey)
          .filter(Boolean);

        const tokens = parsed
          .map((item: any) => item.token)
          .filter(Boolean);

        pendingKeysRef.current = { keys, tokens };

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          sendSubscriptions(wsRef.current);
        }
      } else {
        setRawContracts([]);
        pendingKeysRef.current = { keys: [], tokens: [] };

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          sendSubscriptions(wsRef.current);
        }
      }
    } catch (error) {
      console.error('Query error:', error);
      setErrorMsg('Unable to search symbols in database');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dbInstance) {
      setSelectedExpiry('ALL');
      loadSymbolsFromDb(dbInstance, exchange, kind, search);
    }
  }, [exchange, kind, search, dbInstance]);

  const availableExpiries = useMemo(() => {
    const expiryMap = new Map<string, string>();

    rawContracts.forEach((contract) => {
      if (contract.rawExpiry && contract.expiry) {
        expiryMap.set(contract.rawExpiry, contract.expiry);
      }
    });

    return Array.from(expiryMap.entries())
      .map(([raw, formatted]) => ({ raw, formatted }))
      .sort((a, b) => a.raw.localeCompare(b.raw));
  }, [rawContracts]);

  const contracts = useMemo(() => {
    if (selectedExpiry === 'ALL') return rawContracts;

    return rawContracts.filter(
      (contract) => contract.rawExpiry === selectedExpiry
    );
  }, [rawContracts, selectedExpiry]);

  // Watchlist me complete contract object bhejna
  const handleAddToWatchlist = (contract: any) => {
    const completeContract = {
      ...contract,

      // Important APK-compatible fields
      token: String(contract.token || ''),
      symbol: String(contract.symbol || ''),
      name: String(contract.name || ''),
      exchange: String(contract.exchange || ''),
      exch_seg: String(contract.exch_seg || ''),
      instrumentKey: String(contract.instrumentKey || ''),
      instrument_key: String(contract.instrumentKey || ''),
      lotsize: String(contract.lotsize || '1'),
      lotSize: Number(contract.lotsize || 1),
      tick_size: String(contract.tick_size || '0.05'),
      instrumenttype: String(contract.instrumenttype || ''),

      // Full original SQLite record
      databaseData: {
        ...(contract.databaseData || {})
      }
    };

    console.log('FULL CONTRACT SENT TO WATCHLIST:', completeContract);

    onAddWatch(completeContract);
  };

  return (
    <section className="glass rounded-2xl overflow-hidden">
      <div className="border-b border-white/5 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-gold animate-pulse" />
              <h2 className="font-display text-lg font-bold text-white">
                Options &amp; Futures
              </h2>
            </div>

            <p className="mt-1 text-xs text-gray-500">
              Supabase DB symbols
            </p>
          </div>

          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-semibold text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            {expanded ? 'Hide' : 'Show'}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${
                expanded ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {expanded && (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-white/5 bg-black/40 p-1">
                {exchanges.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setExchange(item)}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                      exchange === item
                        ? 'bg-accent text-white'
                        : 'text-gray-500 hover:text-white'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 rounded-lg border border-white/5 bg-black/40 p-1">
                {kinds.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setKind(item)}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                      kind === item
                        ? 'bg-gold text-black'
                        : 'text-gray-500 hover:text-white'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <div className="text-xs text-gray-400 font-semibold">
                Expiry:
              </div>

              <select
                value={selectedExpiry}
                onChange={(event) => setSelectedExpiry(event.target.value)}
                className="rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-xs font-bold text-accent focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Expiries</option>

                {availableExpiries.map((item) => (
                  <option key={item.raw} value={item.raw}>
                    {item.formatted}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search NIFTY, GOLD, SILVER, strike..."
                className="w-full rounded-lg border border-white/5 bg-black/40 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-gray-600 focus:outline-none"
              />
            </div>
          </>
        )}
      </div>

      {expanded && (
        <div className="max-h-[410px] overflow-y-auto scrollbar-thin p-2 sm:p-3">
          <div className="mb-2 flex items-center justify-between px-2 text-[10px] uppercase tracking-[0.16em] text-gray-600">
            <span>
              {exchange === 'ALL' ? 'All exchanges' : `${exchange} contracts`}
            </span>
            <span>{contracts.length} contracts</span>
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-gray-400">
              Loading contracts from DB...
            </div>
          ) : errorMsg ? (
            <div className="py-8 text-center text-xs text-rose-400">
              Error: {errorMsg}
            </div>
          ) : (
            <div className="space-y-1.5">
              {contracts.map((contract) => {
                const selectedContract = selected === contract.symbol;

                const watched = watchlist.some((item: any) =>
                  typeof item === 'string'
                    ? item === contract.symbol
                    : (
                        item?.symbol === contract.symbol ||
                        item?.token === contract.token
                      )
                );

                return (
                  <div
                    key={contract.token || contract.symbol}
                    className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                      selectedContract
                        ? 'border-accent/40 bg-accent/10'
                        : 'border-white/5 bg-white/[0.015]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(contract.symbol)}
                      className="min-w-0 flex-1 text-left cursor-pointer bg-transparent border-none p-0"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-bold text-white sm:text-[15px]">
                          {contract.name}
                        </span>

                        <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-extrabold text-accent-200">
                          {contract.kind}
                        </span>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                        <span className="text-gold font-medium">
                          {contract.exchange}
                        </span>

                        {contract.expiry && (
                          <>
                            <span>·</span>
                            <span>
                              Exp: <strong className="text-white">{contract.expiry}</strong>
                            </span>
                          </>
                        )}

                        {contract.strike !== undefined && (
                          <>
                            <span>·</span>
                            <span>
                              Strike: <strong className="text-white">{contract.strike}</strong>
                            </span>
                          </>
                        )}

                        <span>·</span>

                        <span>
                          Lot: <strong className="text-white">{contract.lotsize}</strong>
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelect(contract.symbol);
                        if (onOpenChart) onOpenChart(contract);
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/40 text-accent hover:bg-accent/20 transition-colors cursor-pointer"
                      title="Open Chart"
                    >
                      <BarChart2 className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleAddToWatchlist(contract);
                      }}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border cursor-pointer ${
                        watched
                          ? 'border-gold/30 bg-gold/10 text-gold'
                          : 'border-white/5 text-gray-600'
                      }`}
                      title={watched ? 'Added to Watchlist' : 'Add to Watchlist'}
                    >
                      <Star
                        className={`h-4 w-4 ${watched ? 'fill-gold' : ''}`}
                      />
                    </button>

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelect(contract.symbol);
                      }}
                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-gold px-2.5 text-[11px] font-extrabold text-black cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Trade
                    </button>
                  </div>
                );
              })}

              {contracts.length === 0 && (
                <div className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-gray-500">
                  No contracts match this filter.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default ContractBrowser;
```

## `Project/src/components/WatchlistPanel.tsx`

```tsx

import { Star, X, Inbox, BarChart2 } from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';

import { fmtNum } from '@/lib/format';
import { db } from '@/lib/firebase';
import { onValue, ref } from 'firebase/database';
import { RENDER_WS_URL } from '@/lib/marketData';

const DEFAULT_WS_URL = RENDER_WS_URL;

interface WatchlistPanelProps {
  watchlist: any[];
  onSelect: (contract: any) => void;
  onRemove: (symbol: string) => void;
  onOpenChart?: (contract: any) => void;
  selected: string;
}

interface PriceState {
  live: Record<string, number>;
  previous: Record<string, number>;
}

const normalizeToken = (token: string) =>
  token.replace(/:/g, '|').trim();

const getPrice = (data: any): number => {
  const value =
    data?.ltp ??
    data?.price ??
    data?.last_price ??
    data?.cp ??
    data?.close ??
    data;

  const price = Number(value);

  return Number.isFinite(price) && price > 0 ? price : 0;
};

export function WatchlistPanel({
  watchlist = [],
  onSelect,
  onRemove,
  onOpenChart,
  selected,
}: WatchlistPanelProps) {

  const [priceState, setPriceState] = useState<PriceState>({
    live: {},
    previous: {},
  });

  const [wsUrl, setWsUrl] = useState(DEFAULT_WS_URL);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);

  // Read WebSocket URL from Firebase.
  useEffect(() => {
    const urlRef = ref(db, 'settings/ws_url');

    const unsubscribe = onValue(
      urlRef,
      snapshot => {
        const value = snapshot.val();

        if (
          typeof value === 'string' &&
          value.trim() &&
          value.startsWith('wss://')
        ) {
          setWsUrl(value.trim());
        }
      },
      error => {
        console.error('Firebase WS URL error:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Create stable watchlist subscription.
  const watchlistKey = useMemo(() => {
    return JSON.stringify(
      watchlist.map(item => ({
        token: String(
          item.token ||
          item.instrumentKey ||
          ''
        ).trim(),

        symbol: String(item.symbol || '').trim(),
      }))
    );
  }, [watchlist]);

  // Connect WebSocket and subscribe to watchlist.
  useEffect(() => {
    if (!wsUrl) return;

    let stopped = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let currentWs: WebSocket | null = null;

    let reconnectDelay = 3000;

    const items = JSON.parse(watchlistKey);

    const tokens = Array.from(
      new Set<string>([
        'NSE_INDEX|Nifty 50',
        'BSE_INDEX|SENSEX',
        ...items
          .map((item: any) => item.token)
          .filter((token: string) => Boolean(token)),
      ])
    );

    const connectWS = () => {
      if (stopped) return;

      try {
        const ws = new WebSocket(wsUrl);

        currentWs = ws;
        wsRef.current = ws;

        ws.onopen = () => {
          if (stopped) {
            ws.close();
            return;
          }

          console.log('MYT WebSocket Connected');

          setConnected(true);
          reconnectDelay = 3000;

          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                action: 'sub',
                guid: 'upstox_sub_request',
                instrumentKeys: tokens,
                tokens,
              })
            );
          }
        };

        ws.onmessage = event => {
          if (stopped) return;

          try {
            const data = JSON.parse(event.data);

            // Initial prices received from backend.
            if (
              data.type === 'initial_ltps' &&
              data.data &&
              typeof data.data === 'object'
            ) {
              const incoming: Record<string, number> = {};

              Object.entries(data.data).forEach(([key, value]) => {
                const price = getPrice(value);

                if (price > 0) {
                  incoming[key] = price;
                  incoming[normalizeToken(key)] = price;
                }
              });

              setPriceState(previous => {
                const live = { ...previous.live };
                const old = { ...previous.previous };

                Object.entries(incoming).forEach(([key, price]) => {
                  if (live[key] !== undefined) {
                    old[key] = live[key];
                  } else {
                    old[key] = price;
                  }

                  live[key] = price;
                });

                return {
                  live,
                  previous: old,
                };
              });

              return;
            }

            // Normal live price updates.
            const tokenKey = String(
              data.instrument_key ||
              data.instrumentKey ||
              data.token ||
              data.t ||
              data.symbol ||
              ''
            ).trim();

            const price = getPrice(data);

            if (!tokenKey || price <= 0) return;

            const alternateKey = normalizeToken(tokenKey);

            const keys = Array.from(
              new Set([
                tokenKey,
                alternateKey,
                ...(data.symbol ? [String(data.symbol)] : []),
              ])
            );

            setPriceState(previous => {
              const live = { ...previous.live };
              const old = { ...previous.previous };

              const oldPrice =
                live[tokenKey] ??
                live[alternateKey] ??
                live[data.symbol] ??
                price;

              keys.forEach(key => {
                old[key] = oldPrice;
                live[key] = price;
              });

              return {
                live,
                previous: old,
              };
            });

          } catch (error) {
            console.error('WebSocket message error:', error);
          }
        };

        ws.onerror = error => {
          console.error('MYT WebSocket error:', error);
        };

        ws.onclose = () => {
          if (currentWs === ws) {
            currentWs = null;
            wsRef.current = null;
          }

          setConnected(false);

          if (!stopped) {
            reconnectTimer = setTimeout(
              connectWS,
              reconnectDelay
            );

            reconnectDelay = Math.min(
              reconnectDelay * 2,
              15000
            );
          }
        };

      } catch (error) {
        console.error('WebSocket connection failed:', error);

        if (!stopped) {
          reconnectTimer = setTimeout(connectWS, reconnectDelay);
        }
      }
    };

    connectWS();

    return () => {
      stopped = true;

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }

      if (currentWs) {
        currentWs.onopen = null;
        currentWs.onmessage = null;
        currentWs.onerror = null;
        currentWs.onclose = null;

        currentWs.close(1000, 'Watchlist updated');

        currentWs = null;
      }

      if (wsRef.current) {
        wsRef.current = null;
      }

      setConnected(false);
    };

  }, [wsUrl, watchlistKey]);

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">

      {/* Header */}
      <div className="flex items-center justify-between mb-3">

        <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">

          <Star className="h-5 w-5 text-gold fill-gold" />

          Watchlist &amp; Live LTP Checker

          <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium text-gray-400">
            {watchlist.length}
          </span>

        </h3>

        <span className={`flex items-center gap-1.5 text-[10px] ${
          connected ? 'text-emerald-400' : 'text-rose-400'
        }`}>

          <span className={`h-2 w-2 rounded-full ${
            connected ? 'bg-emerald-400' : 'bg-rose-400'
          } animate-pulse`} />

          {connected ? 'CONNECTED' : 'CONNECTING'}

        </span>

      </div>

      {/* Empty Watchlist */}
      {watchlist.length === 0 ? (

        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">

          <Inbox className="h-7 w-7 text-gray-700 mb-2" />

          <p className="text-sm text-gray-500">
            Your watchlist is empty.
          </p>

          <p className="text-xs text-gray-600 mt-1">
            Tap the Star icon in the contract browser to add instruments here.
          </p>

        </div>

      ) : (

        /* Watchlist Items */
        <div className="space-y-1.5 max-h-[350px] overflow-y-auto scrollbar-thin">

          {watchlist.map((item, index) => {

            const sym = String(item.symbol || '');

            const name = item.name || sym;

            const tokenKey = String(
              item.token ||
              item.instrumentKey ||
              ''
            );

            const altTokenKey = normalizeToken(tokenKey);

            const priceValue =
              priceState.live[tokenKey] ??
              priceState.live[altTokenKey] ??
              priceState.live[sym] ??
              item.price ??
              0;

            const price = Number(priceValue) || 0;

            const oldPrice =
              priceState.previous[tokenKey] ??
              priceState.previous[altTokenKey] ??
              priceState.previous[sym] ??
              price;

            const isGreen = price >= oldPrice;

            const isSelected = selected === sym;

            return (

              <div
                key={tokenKey || sym || index}
                onClick={() => onSelect(item)}
                className={`group flex items-center justify-between rounded-xl border p-3 transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-accent/40 bg-accent/20'
                    : 'border-white/10 bg-black/40 hover:border-white/20'
                }`}
              >

                {/* Instrument Details */}
                <div className="min-w-0 flex-1">

                  <div className="flex items-center gap-2">

                    <span className="text-[15px] font-bold text-white tracking-wide truncate">
                      {name}
                    </span>

                    {item.kind && (
                      <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[10px] font-extrabold text-gold">
                        {item.kind}
                      </span>
                    )}

                  </div>

                </div>

                {/* Price and Actions */}
                <div className="flex items-center gap-3">

                  <div className="text-right">

                    <div className={`font-mono text-sm font-bold ${
                      isGreen ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {fmtNum(price)}
                    </div>

                    <div className="font-mono text-[10px] text-gray-400 flex items-center justify-end gap-1">

                      <span className={`h-1.5 w-1.5 rounded-full ${
                        connected
                          ? 'bg-emerald-400'
                          : 'bg-gray-500'
                      } animate-pulse`} />

                      {connected ? 'Live LTP' : 'Waiting'}

                    </div>

                  </div>

                  {/* Open Chart */}
                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation();

                      onSelect(item);
                      onOpenChart?.(item);
                    }}
                    className="p-1.5 rounded-lg border border-white/10 bg-black/50 text-accent hover:bg-accent/20 transition-colors cursor-pointer"
                    title="Open Chart"
                  >
                    <BarChart2 className="h-4 w-4" />
                  </button>

                  {/* Remove */}
                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation();
                      onRemove(sym);
                    }}
                    className="rounded p-1 text-gray-400 hover:bg-rose-500/10 hover:text-rose-400 transition-all cursor-pointer"
                    title="Remove from Watchlist"
                  >
                    <X className="h-4 w-4" />
                  </button>

                </div>

              </div>

            );
          })}

        </div>

      )}

    </div>
  );
}

export default WatchlistPanel;
```

## `Project/src/components/SourceBrowser.tsx`

```tsx
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowUpRight, Check, Code2, Copy, FileCode2, Search } from 'lucide-react';
import sourceDocument from '@/data/complete-source.md?raw';

interface SourceFile {
  path: string;
  language: string;
  content: string;
}

const sourceBlockPattern = /^## `([^`]+)`[ \t]*\r?\n\r?\n(`{3,})([a-z0-9]+)[ \t]*\r?\n([\s\S]*?)\r?\n\2[ \t]*(?=\r?$)/gim;

const sourceFiles: SourceFile[] = Array.from(
  sourceDocument.matchAll(sourceBlockPattern),
  (match) => ({
    path: match[1],
    language: match[3].toUpperCase(),
    content: match[4].endsWith('\n') ? match[4] : `${match[4]}\n`,
  }),
);

function highlightLine(line: string, query: string): ReactNode {
  const needle = query.trim();
  if (!needle) return line || ' ';

  const loweredLine = line.toLowerCase();
  const loweredNeedle = needle.toLowerCase();
  const segments: ReactNode[] = [];
  let cursor = 0;
  let matchIndex = loweredLine.indexOf(loweredNeedle, cursor);

  while (matchIndex !== -1) {
    if (matchIndex > cursor) {
      segments.push(line.slice(cursor, matchIndex));
    }
    segments.push(
      <mark
        key={`${matchIndex}-${cursor}`}
        className="rounded bg-amber-300 px-0.5 text-slate-950"
      >
        {line.slice(matchIndex, matchIndex + needle.length)}
      </mark>,
    );
    cursor = matchIndex + needle.length;
    matchIndex = loweredLine.indexOf(loweredNeedle, cursor);
  }

  if (cursor < line.length) segments.push(line.slice(cursor));
  return segments.length ? segments : line || ' ';
}

export function SourceBrowser() {
  const [query, setQuery] = useState('');
  const [selectedPath, setSelectedPath] = useState(sourceFiles[0]?.path ?? '');
  const [copyStatus, setCopyStatus] = useState('');
  const normalizedQuery = query.trim().toLowerCase();

  const filteredFiles = useMemo(() => {
    if (!normalizedQuery) return sourceFiles;
    return sourceFiles.filter((file) =>
      file.path.toLowerCase().includes(normalizedQuery) ||
      file.content.toLowerCase().includes(normalizedQuery),
    );
  }, [normalizedQuery]);

  const activeFile =
    filteredFiles.find((file) => file.path === selectedPath) ??
    filteredFiles[0] ??
    null;
  const lines = activeFile
    ? activeFile.content.replace(/\n$/, '').split('\n')
    : [];

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'TradeND Source Library';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  async function copyActiveFile() {
    if (!activeFile) return;
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopyStatus(`${activeFile.path} copied to clipboard`);
    } catch {
      setCopyStatus('Clipboard access is unavailable in this browser');
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white/90">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <a href="/" className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-200">
              <Code2 aria-hidden="true" className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold tracking-tight text-slate-950">TradeND</span>
              <span className="block text-xs text-slate-500">Source library</span>
            </span>
          </a>

          <a
            href="/trade"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <span className="hidden sm:inline">Open trading app</span>
            <span className="sm:hidden">TradeND app</span>
            <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-[1480px] px-4 pb-10 pt-8 sm:px-6 lg:px-8 lg:pt-12">
        <section className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-indigo-700">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />
              Developer reference
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Complete trading update source
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Browse the complete files for live market data, candlestick charts, and market-hours validation. Search across files, inspect line numbers, and copy any file in full.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-medium text-slate-600">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">{sourceFiles.length} files</span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">TypeScript</span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">Feature snapshot</span>
          </div>
        </section>

        <section aria-label="Source code browser" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_48px_-28px_rgba(15,23,42,0.28)]">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Source files</h2>
              <p className="mt-1 text-xs text-slate-500">Full file contents from the saved source artifact</p>
            </div>
            <label className="relative block w-full sm:max-w-sm">
              <span className="sr-only">Search source files and code</span>
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="source-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search filenames or code…"
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
              />
            </label>
          </div>

          <div className="grid min-h-[680px] grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside aria-label="File navigation" className="border-b border-slate-200 bg-slate-50/70 p-3 lg:border-b-0 lg:border-r lg:p-4">
              <div className="mb-3 flex items-center justify-between px-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Files</span>
                <span className="rounded-md bg-white px-2 py-0.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">{filteredFiles.length}</span>
              </div>
              <nav aria-label="Source files">
                {filteredFiles.length > 0 ? (
                  <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
                    {filteredFiles.map((file) => {
                      const selected = activeFile?.path === file.path;
                      const displayPath = file.path.replace(/^Project\//, '');
                      return (
                        <li key={file.path} className="shrink-0 lg:shrink">
                          <button
                            type="button"
                            aria-pressed={selected}
                            onClick={() => {
                              setSelectedPath(file.path);
                              setCopyStatus('');
                            }}
                            className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                              selected
                                ? 'border-indigo-200 bg-indigo-50 text-indigo-900 shadow-sm'
                                : 'border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900'
                            }`}
                          >
                            <FileCode2 aria-hidden="true" className={`h-4 w-4 shrink-0 ${selected ? 'text-indigo-600' : 'text-slate-400 group-hover:text-indigo-500'}`} />
                            <span className="min-w-0">
                              <span className="block max-w-[210px] truncate text-xs font-semibold">{displayPath}</span>
                              <span className={`mt-1 block text-[10px] uppercase tracking-wider ${selected ? 'text-indigo-600' : 'text-slate-400'}`}>{file.language}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-300 px-3 py-5 text-center text-sm text-slate-500">No files match this search.</p>
                )}
              </nav>
            </aside>

            <section aria-label="Selected source file" className="min-w-0">
              {activeFile ? (
                <>
                  <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-xs font-semibold text-slate-800 sm:text-sm">{activeFile.path}</div>
                      <div className="mt-1 text-xs text-slate-500">{lines.length.toLocaleString('en-US')} lines · {activeFile.language}</div>
                    </div>
                    <button
                      type="button"
                      onClick={copyActiveFile}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                    >
                      {copyStatus.startsWith(activeFile.path) ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
                      {copyStatus.startsWith(activeFile.path) ? 'Copied' : 'Copy file'}
                    </button>
                  </div>

                  <div className="max-h-[68vh] min-h-[480px] overflow-auto bg-slate-950 px-3 py-4 sm:px-5">
                    <div className="min-w-max font-mono text-[11px] leading-5 sm:text-xs sm:leading-[1.45rem]">
                      {lines.map((line, index) => (
                        <div key={index} className="grid grid-cols-[3.25rem_minmax(0,1fr)] pr-4">
                          <span aria-hidden="true" className="select-none pr-4 text-right text-slate-500">{index + 1}</span>
                          <span className="whitespace-pre text-slate-200">{highlightLine(line, normalizedQuery)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid min-h-[480px] place-items-center px-6 text-center">
                  <div>
                    <Search aria-hidden="true" className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-3 text-sm font-semibold text-slate-700">No source matches your search</p>
                    <p className="mt-1 text-xs text-slate-500">Try another filename, function, or phrase.</p>
                  </div>
                </div>
              )}
            </section>
          </div>
        </section>

        <p role="status" aria-live="polite" className="mt-3 min-h-5 text-right text-xs text-slate-500">{copyStatus}</p>
        <footer className="mt-8 flex flex-col gap-2 border-t border-slate-200 pt-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>TradeND source reference · complete file snapshots</span>
          <a href="/trade" className="inline-flex items-center gap-1 font-semibold text-indigo-700 hover:text-indigo-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
            Return to trading app <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
          </a>
        </footer>
      </div>
    </main>
  );
}
```

## `Project/src/hooks/useSelectedMarketFeed.ts`

```ts
import { useEffect, useMemo, useState } from 'react';
import {
  getMarketPrice,
  getMarketTimestamp,
  matchesMarketInstrument,
  normalizeMarketKey,
  RENDER_WS_URL,
  type MarketTick,
} from '@/lib/marketData';

interface InstrumentIdentity {
  symbol?: string;
  token?: string;
  instrumentKey?: string;
  exchange?: string;
  exch_seg?: string;
}

interface MarketFeedState {
  identity: string;
  connected: boolean;
  hasLivePrice: boolean;
  livePrice: number;
  ticks: MarketTick[];
}

const MAX_TICKS = 6000;
const RECONNECT_MAX_MS = 15000;
const INDEX_INSTRUMENT_KEYS: Record<string, string> = {
  'NIFTY 50': 'NSE_INDEX|Nifty 50',
  SENSEX: 'BSE_INDEX|SENSEX',
};

function emptyState(identity: string): MarketFeedState {
  return {
    identity,
    connected: false,
    hasLivePrice: false,
    livePrice: 0,
    ticks: [],
  };
}

export function useSelectedMarketFeed(
  instrument: InstrumentIdentity | null | undefined,
  fallbackPrice = 0
) {
  const symbol = String(instrument?.symbol ?? '').trim();
  const token = String(instrument?.token ?? '').trim();
  const exchange = String(instrument?.exch_seg ?? instrument?.exchange ?? 'NSE').trim();
  const instrumentKey = String(
    instrument?.instrumentKey ||
    (token ? `${exchange}|${token}` : '') ||
    INDEX_INSTRUMENT_KEYS[symbol.toUpperCase()] ||
    ''
  ).trim();
  const identity = useMemo(
    () => [symbol, exchange, instrumentKey, token].join('::'),
    [symbol, exchange, instrumentKey, token]
  );
  const aliases = useMemo(
    () => Array.from(new Set([symbol, instrumentKey, token].filter(Boolean))),
    [symbol, instrumentKey, token]
  );
  const [state, setState] = useState<MarketFeedState>(() => emptyState(''));

  useEffect(() => {
    if (!symbol) {
      setState(emptyState(identity));
      return;
    }

    setState((previous) => previous.identity === identity ? previous : emptyState(identity));

    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = 1000;

    const updateState = (update: (current: MarketFeedState) => MarketFeedState) => {
      setState((previous) => update(previous.identity === identity ? previous : emptyState(identity)));
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
    };

    const applyQuote = (key: unknown, value: unknown, fallbackKey?: unknown) => {
      const quoteKey = key ?? fallbackKey;
      const quote = value && typeof value === 'object'
        ? value as Record<string, unknown>
        : {};
      const effectiveKey = quoteKey ?? quote.instrument_key ?? quote.instrumentKey ?? quote.token ?? quote.symbol;
      if (!matchesMarketInstrument(effectiveKey, aliases)) return;

      const price = getMarketPrice(value);
      if (price <= 0) return;

      const tick: MarketTick = {
        timestamp: getMarketTimestamp(quote),
        price,
      };

      updateState((current) => ({
        ...current,
        hasLivePrice: true,
        livePrice: price,
        ticks: [...current.ticks, tick].slice(-MAX_TICKS),
      }));
    };

    const handleMessage = (raw: unknown) => {
      let message: unknown;
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (!message || typeof message !== 'object') return;
      const record = message as Record<string, unknown>;
      const payload = record.data;

      if (record.type === 'initial_ltps' && payload && typeof payload === 'object' && !Array.isArray(payload)) {
        Object.entries(payload as Record<string, unknown>).forEach(([key, value]) => applyQuote(key, value));
        return;
      }

      const nestedRecord = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : null;
      const directKey = record.instrument_key ?? record.instrumentKey ?? record.token ?? record.t ?? record.symbol;
      const directPrice = getMarketPrice(record);

      if (directPrice > 0) {
        applyQuote(directKey, record);
        return;
      }

      if (nestedRecord) {
        const nestedKey = nestedRecord.instrument_key ?? nestedRecord.instrumentKey ?? nestedRecord.token ?? nestedRecord.t ?? nestedRecord.symbol;
        if (getMarketPrice(nestedRecord) > 0) {
          applyQuote(nestedKey ?? directKey, nestedRecord);
          return;
        }
        Object.entries(nestedRecord).forEach(([key, value]) => applyQuote(key, value));
      }
    };

    const connect = () => {
      if (disposed) return;

      try {
        const ws = new WebSocket(RENDER_WS_URL);
        socket = ws;

        ws.onopen = () => {
          if (disposed) {
            ws.close(1000, 'Market feed no longer needed');
            return;
          }

          reconnectDelay = 1000;
          updateState((current) => ({ ...current, connected: true }));
          const keys = Array.from(new Set([instrumentKey, symbol, token].filter(Boolean)));
          const tokens = Array.from(new Set([token, instrumentKey].filter(Boolean)));

          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              action: 'sub',
              guid: `tradend_${normalizeMarketKey(symbol).replace(/[^A-Z0-9]+/g, '_') || 'selected'}`,
              instrumentKeys: keys,
              tokens,
            }));
          }
        };

        ws.onmessage = (event) => handleMessage(event.data);
        ws.onerror = () => ws.close();
        ws.onclose = () => {
          if (socket === ws) socket = null;
          if (disposed) return;
          updateState((current) => ({ ...current, connected: false }));
          scheduleReconnect();
        };
      } catch {
        scheduleReconnect();
      }
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close(1000, 'Selected instrument changed');
        socket = null;
      }
    };
  }, [aliases, exchange, identity, instrumentKey, symbol, token]);

  const current = state.identity === identity ? state : emptyState(identity);
  return {
    livePrice: current.hasLivePrice ? current.livePrice : (Number(fallbackPrice) > 0 ? Number(fallbackPrice) : 0),
    hasLivePrice: current.hasLivePrice,
    connected: current.connected,
    ticks: current.ticks,
  };
}
```

## `Project/src/lib/marketData.ts`

```ts
export const RENDER_WS_URL = 'wss://myt-backend-1.onrender.com/ws';

export interface MarketTick {
  timestamp: number;
  price: number;
}

export function normalizeMarketKey(value: unknown): string {
  return String(value ?? '').trim().replace(/:/g, '|').toUpperCase();
}

export function getMarketPrice(value: unknown): number {
  const record = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : null;
  const candidate = record
    ? record.ltp ?? record.price ?? record.last_price ?? record.lastPrice ?? record.cp ?? record.close
    : value;
  const price = Number(candidate);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

export function getMarketTimestamp(
  value: Record<string, unknown>,
  fallback = Date.now()
): number {
  const raw = value.timestamp ?? value.ts ?? value.exchange_timestamp ?? value.last_trade_time ?? value.time;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw < 1_000_000_000_000 ? raw * 1000 : raw;
  }

  if (typeof raw === 'string' && raw.trim()) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
      return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }

  return fallback;
}

export function matchesMarketInstrument(
  key: unknown,
  aliases: string[]
): boolean {
  const normalizedKey = normalizeMarketKey(key);
  if (!normalizedKey) return false;

  return aliases.some((alias) => {
    const normalizedAlias = normalizeMarketKey(alias);
    return normalizedAlias !== '' && normalizedAlias === normalizedKey;
  });
}
```

## `Project/src/lib/marketHours.ts`

```ts
export const MARKET_CLOSED_MESSAGE =
  'Market Closed - Orders can only be placed during market hours.';

export interface MarketStatus {
  isOpen: boolean;
  message: string;
  sessionLabel: string;
}

const INDIA_TIME_ZONE = 'Asia/Kolkata';
const NEW_YORK_TIME_ZONE = 'America/New_York';

function getIndiaMarketClock(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: INDIA_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    weekday: values.weekday,
    minutes: Number(values.hour) * 60 + Number(values.minute),
  };
}

function isUsDaylightSavingTime(now: Date): boolean {
  const timeZoneName = new Intl.DateTimeFormat('en-US', {
    timeZone: NEW_YORK_TIME_ZONE,
    timeZoneName: 'short',
  }).formatToParts(now).find((part) => part.type === 'timeZoneName')?.value;
  return timeZoneName === 'EDT';
}

export function getMarketStatus(exchange: string, now = new Date()): MarketStatus {
  const normalizedExchange = String(exchange || 'NSE').trim().toUpperCase();
  const { weekday, minutes } = getIndiaMarketClock(now);
  const isWeekday = weekday !== 'Sat' && weekday !== 'Sun';
  const isMcx = normalizedExchange.includes('MCX');
  const isEquity = /^(NSE|BSE|NFO|BFO)/.test(normalizedExchange.replace(/[^A-Z0-9]/g, ''));

  if (!isMcx && !isEquity) {
    return {
      isOpen: false,
      message: MARKET_CLOSED_MESSAGE,
      sessionLabel: 'No configured trading session for this exchange',
    };
  }

  const startMinutes = isMcx ? 9 * 60 : 9 * 60 + 15;
  const endMinutes = isMcx
    ? isUsDaylightSavingTime(now) ? 23 * 60 + 30 : 23 * 60 + 55
    : 15 * 60 + 30;
  const sessionLabel = isMcx
    ? `9:00 AM–${isUsDaylightSavingTime(now) ? '11:30 PM' : '11:55 PM'} IST`
    : '9:15 AM–3:30 PM IST';
  const isOpen = isWeekday && minutes >= startMinutes && minutes < endMinutes;

  return {
    isOpen,
    message: isOpen ? 'Market Open' : MARKET_CLOSED_MESSAGE,
    sessionLabel,
  };
}
```

## `Project/src/lib/chartData.ts`

```ts
import type { Candle, Timeframe } from '@/types';
import type { MarketTick } from '@/lib/marketData';

const TIMEFRAME_MILLISECONDS: Record<Timeframe, number> = {
  '1M': 60_000,
  '3M': 3 * 60_000,
  '5M': 5 * 60_000,
  '15M': 15 * 60_000,
  '30M': 30 * 60_000,
  '1H': 60 * 60_000,
  '1D': 24 * 60 * 60_000,
  '1W': 7 * 24 * 60 * 60_000,
  '60D': 24 * 60 * 60_000,
};

export function aggregateTicksToCandles(
  ticks: MarketTick[],
  timeframe: Timeframe,
  maxCandles = 120
): Candle[] {
  const interval = TIMEFRAME_MILLISECONDS[timeframe];
  const candlesByStart = new Map<number, Candle>();
  const orderedTicks = ticks
    .filter((tick) => Number.isFinite(tick.timestamp) && Number.isFinite(tick.price) && tick.price > 0)
    .slice()
    .sort((left, right) => left.timestamp - right.timestamp);

  for (const tick of orderedTicks) {
    const start = Math.floor(tick.timestamp / interval) * interval;
    const candle = candlesByStart.get(start);

    if (candle) {
      candle.high = Math.max(candle.high, tick.price);
      candle.low = Math.min(candle.low, tick.price);
      candle.close = tick.price;
      continue;
    }

    candlesByStart.set(start, {
      time: start,
      open: tick.price,
      high: tick.price,
      low: tick.price,
      close: tick.price,
    });
  }

  return Array.from(candlesByStart.values()).slice(-maxCandles);
}
```

## `Project/api/trading.ts`

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import {
  calculateCappedPnl,
  calculateMargin,
  calculateNotional,
  calculateOptionSellMargin,
  getGoldContractGrams,
  getContractMultiplier,
  roundCurrency,
} from '../src/lib/tradingMath';
import { getMarketStatus, MARKET_CLOSED_MESSAGE } from '../src/lib/marketHours';

type AccountRecord = Record<string, any>;
type MutationResult =
  | { ok: true; account: AccountRecord; response: unknown }
  | { ok: false; error: string };

const DATABASE_URL = 'https://trade-f600a-default-rtdb.firebaseio.com';
const STARTING_BALANCE = 50000;
const MAX_QUANTITY = 100_000_000;

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

function getAdminApp() {
  const existing = getApps().find((app) => app.name === '[DEFAULT]');
  if (existing) return existing;

  const serializedCredentials = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serializedCredentials) {
    try {
      return initializeApp({
        credential: cert(JSON.parse(serializedCredentials)),
        databaseURL: DATABASE_URL,
      });
    } catch {
      throw new ApiError(503, 'Firebase server credentials are invalid.');
    }
  }

  const privateKey = process.env.PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!privateKey) {
    throw new ApiError(503, 'Firebase server credentials are not configured.');
  }

  return initializeApp({
    credential: cert({
      projectId: 'trade-f600a',
      clientEmail: 'firebase-adminsdk-fbsvc@trade-f600a.iam.gserviceaccount.com',
      privateKey,
    }),
    databaseURL: DATABASE_URL,
  });
}

function requireObject(value: unknown): AccountRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as AccountRecord)
    : {};
}

function parseBody(request: VercelRequest): AccountRecord {
  if (request.body && typeof request.body === 'object') {
    return request.body as AccountRecord;
  }
  if (typeof request.body === 'string') {
    try {
      return requireObject(JSON.parse(request.body));
    } catch {
      throw new ApiError(400, 'Request body must be valid JSON.');
    }
  }
  return {};
}

async function requireUid(request: VercelRequest): Promise<string> {
  const authorization = request.headers.authorization;
  const match = typeof authorization === 'string'
    ? authorization.match(/^Bearer\s+(.+)$/i)
    : null;
  if (!match) throw new ApiError(401, 'Please sign in again to trade.');

  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(match[1], true);
    return decoded.uid;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, 'Your session is invalid or expired. Please sign in again.');
  }
}

function validateMoney(value: unknown, label: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 1_000_000_000) {
    throw new ApiError(400, `${label} must be a valid positive number.`);
  }
  return numeric;
}

function leverageChoices(exchange: string): number[] {
  return exchange.toUpperCase().includes('MCX')
    ? [10, 25, 50, 100, 200, 300, 400, 500]
    : [1, 2, 3, 5, 7, 10];
}

function requireOpenMarket(exchange: string) {
  const status = getMarketStatus(exchange, new Date());
  if (!status.isOpen) throw new ApiError(409, MARKET_CLOSED_MESSAGE);
}

function cloneAccount(value: unknown): AccountRecord {
  const account = requireObject(value);
  return JSON.parse(JSON.stringify(account)) as AccountRecord;
}

async function transactAccount<T>(
  uid: string,
  mutate: (account: AccountRecord) => MutationResult
): Promise<T> {
  const transactionState: { mutation?: MutationResult } = {};
  const result = await getDatabase(getAdminApp())
    .ref(`users_details/${uid}`)
    .transaction((current) => {
      const mutation = mutate(cloneAccount(current));
      transactionState.mutation = mutation;
      return mutation.ok ? mutation.account : undefined;
    }, undefined, false);

  const mutation = transactionState.mutation;
  if (!result.committed || !mutation || mutation.ok === false) {
    const message = mutation?.ok === false
      ? mutation.error
      : 'The account changed before the trade completed. Please retry.';
    throw new ApiError(409, message);
  }
  return mutation.response as T;
}

function openPosition(body: AccountRecord, uid: string) {
  const symbol = typeof body.symbol === 'string' ? body.symbol.trim().slice(0, 80) : '';
  if (!symbol) throw new ApiError(400, 'Choose a valid instrument.');

  const side = body.side === 'BUY' || body.side === 'SELL' ? body.side : null;
  if (!side) throw new ApiError(400, 'Order side must be BUY or SELL.');

  const exchange = typeof body.exchange === 'string'
    ? body.exchange.trim().slice(0, 24)
    : 'NSE';
  requireOpenMarket(exchange);
  const quantity = Number(body.qty);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    throw new ApiError(400, 'Quantity must be a positive whole number.');
  }

  const entryPrice = validateMoney(body.entryPrice, 'Order price');
  const leverage = Number(String(body.leverage ?? '').replace(/[xX]$/, ''));
  if (!leverageChoices(exchange).includes(leverage)) {
    throw new ApiError(400, 'The selected leverage is not available for this exchange.');
  }

  const requestedKind = String(body.kind ?? '').trim().toUpperCase();
  const optionKind = requestedKind === 'CE' || requestedKind === 'PE'
    ? requestedKind
    : null;
  const lots = Number(body.lots);
  const lotSize = Number(body.lotSize);
  if (optionKind) {
    if (!Number.isSafeInteger(lots) || lots < 1 || lots > MAX_QUANTITY) {
      throw new ApiError(400, 'Option lots must be a positive whole number.');
    }
    if (!Number.isSafeInteger(lotSize) || lotSize < 1 || lotSize > MAX_QUANTITY) {
      throw new ApiError(400, 'Option lot size must be a positive whole number.');
    }
    const expectedQuantity = getGoldContractGrams(symbol) > 0
      ? lots
      : lots * lotSize;
    if (!Number.isSafeInteger(expectedQuantity) || expectedQuantity !== quantity) {
      throw new ApiError(400, 'Option quantity must match its lot count and lot size.');
    }
  }

  const contractMultiplier = getContractMultiplier(symbol);
  const notional = calculateNotional(symbol, entryPrice, quantity);
  const isOptionSell = side === 'SELL' && optionKind !== null;
  const margin = isOptionSell
    ? calculateOptionSellMargin(lots)
    : calculateMargin(notional, leverage);
  if (!Number.isFinite(margin) || margin <= 0) {
    throw new ApiError(400, 'The calculated margin is invalid.');
  }

  const id = crypto.randomUUID();
  const openedAt = Date.now();
  const position = {
    id,
    symbol,
    name: typeof body.name === 'string' ? body.name.trim().slice(0, 120) : symbol,
    side,
    qty: quantity,
    entryPrice,
    currentPrice: validateMoney(body.currentPrice ?? entryPrice, 'Current price'),
    leverage: `${leverage}X`,
    margin,
    notional,
    contractMultiplier,
    exchange,
    product: body.product === 'DELIVERY' ? 'DELIVERY' : 'INTRADAY',
    orderType: body.orderType === 'LIMIT' ? 'LIMIT' : 'MARKET',
    ...(optionKind ? { kind: optionKind, lots, lotSize } : {}),
    openedAt,
    status: 'OPEN',
  };

  return transactAccount<{ position: typeof position; balance: number }>(uid, (account) => {
    const currentMarketStatus = getMarketStatus(exchange, new Date());
    if (!currentMarketStatus.isOpen) {
      return { ok: false, error: MARKET_CLOSED_MESSAGE };
    }

    const funds = requireObject(account.funds);
    const storedBalance = funds.balance === undefined || funds.balance === null
      ? STARTING_BALANCE
      : Number(funds.balance);
    if (!Number.isFinite(storedBalance) || storedBalance < 0) {
      return { ok: false, error: 'The wallet balance is invalid. Please contact support.' };
    }

    const openPositions = requireObject(account.open_positions);
    const balance = roundCurrency(storedBalance);
    if (margin > balance) {
      return {
        ok: false,
        error: `Insufficient available balance. Required margin is ₹${margin.toFixed(2)}.`,
      };
    }

    const nextAccount = cloneAccount(account);
    nextAccount.funds = { ...funds, balance: roundCurrency(balance - margin) };
    nextAccount.open_positions = { ...openPositions, [id]: position };
    return {
      ok: true,
      account: nextAccount,
      response: { position, balance: roundCurrency(balance - margin) },
    };
  });
}

function settlePosition(
  positionId: string,
  position: AccountRecord,
  exitPrice: number
) {
  const symbol = String(position.symbol ?? '');
  const side = position.side === 'BUY' || position.side === 'SELL' ? position.side : null;
  const quantity = Number(position.qty);
  const entryPrice = Number(position.entryPrice);
  const margin = Number(position.margin);
  if (!side || !Number.isSafeInteger(quantity) || quantity <= 0 ||
      !Number.isFinite(entryPrice) || entryPrice <= 0 ||
      !Number.isFinite(margin) || margin <= 0) {
    throw new ApiError(409, 'This position has invalid trade data and cannot be settled.');
  }

  const contractMultiplier = getContractMultiplier(symbol);
  const realizedPnl = calculateCappedPnl({
    symbol,
    side,
    qty: quantity,
    entryPrice,
    margin,
    contractMultiplier,
  }, exitPrice);
  const closedAt = Date.now();
  const buyPrice = side === 'BUY' ? entryPrice : exitPrice;
  const sellPrice = side === 'BUY' ? exitPrice : entryPrice;

  return {
    history: {
      id: positionId,
      symbol,
      name: typeof position.name === 'string' ? position.name : symbol,
      side,
      qty: quantity,
      buyPrice,
      sellPrice,
      entryPrice,
      exitPrice,
      margin: roundCurrency(margin),
      realizedPnl,
      closedAt,
      openedAt: Number(position.openedAt ?? position.timestamp ?? closedAt),
      leverage: String(position.leverage ?? ''),
      contractMultiplier,
    },
    releasedBalance: roundCurrency(margin + realizedPnl),
  };
}

function closeOne(body: AccountRecord, uid: string) {
  const positionId = typeof body.id === 'string' ? body.id : '';
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(positionId)) {
    throw new ApiError(400, 'Choose a valid position to exit.');
  }
  const exitPrice = validateMoney(body.exitPrice, 'Exit price');

  return transactAccount<{ history: Record<string, unknown>; balance: number }>(uid, (account) => {
    const openPositions = requireObject(account.open_positions);
    const position = requireObject(openPositions[positionId]);
    if (!position.id) return { ok: false, error: 'This position is no longer open.' };
    const marketStatus = getMarketStatus(String(position.exchange ?? 'NSE'), new Date());
    if (!marketStatus.isOpen) return { ok: false, error: MARKET_CLOSED_MESSAGE };
    const funds = requireObject(account.funds);
    const balance = Number(funds.balance ?? 0);
    if (!Number.isFinite(balance) || balance < 0) {
      return { ok: false, error: 'The wallet balance is invalid. Please contact support.' };
    }

    const settlement = settlePosition(positionId, position, exitPrice);
    const history = requireObject(account.trade_history);
    const nextOpenPositions = { ...openPositions };
    delete nextOpenPositions[positionId];
    const nextBalance = roundCurrency(balance + settlement.releasedBalance);
    const nextAccount = cloneAccount(account);
    nextAccount.funds = { ...funds, balance: nextBalance };
    nextAccount.open_positions = nextOpenPositions;
    nextAccount.trade_history = { ...history, [positionId]: settlement.history };
    return {
      ok: true,
      account: nextAccount,
      response: { history: settlement.history, balance: nextBalance },
    };
  });
}

function closeAll(body: AccountRecord, uid: string) {
  const closePrices = requireObject(body.closePrices);
  return transactAccount<{ closed: number; balance: number }>(uid, (account) => {
    const openPositions = requireObject(account.open_positions);
    const entries = Object.entries(openPositions);
    if (entries.length === 0) return { ok: false, error: 'There are no open positions to exit.' };

    const funds = requireObject(account.funds);
    const balance = Number(funds.balance ?? 0);
    if (!Number.isFinite(balance) || balance < 0) {
      return { ok: false, error: 'The wallet balance is invalid. Please contact support.' };
    }

    const history = requireObject(account.trade_history);
    const nextOpenPositions = { ...openPositions };
    const nextHistory = { ...history };
    let nextBalance = roundCurrency(balance);
    let closed = 0;

    for (const [positionId, rawPosition] of entries) {
      const position = requireObject(rawPosition);
      const marketStatus = getMarketStatus(String(position.exchange ?? 'NSE'), new Date());
      if (!marketStatus.isOpen) return { ok: false, error: MARKET_CLOSED_MESSAGE };
      const requestedPrice = Number(closePrices[position.symbol]);
      const fallbackPrice = Number(position.currentPrice ?? position.entryPrice);
      const exitPrice = Number.isFinite(requestedPrice) && requestedPrice > 0
        ? requestedPrice
        : fallbackPrice;
      if (!Number.isFinite(exitPrice) || exitPrice <= 0) {
        return { ok: false, error: `A valid exit price is unavailable for ${position.symbol}.` };
      }

      const settlement = settlePosition(positionId, position, exitPrice);
      nextBalance = roundCurrency(nextBalance + settlement.releasedBalance);
      nextHistory[positionId] = settlement.history;
      delete nextOpenPositions[positionId];
      closed += 1;
    }

    const nextAccount = cloneAccount(account);
    nextAccount.funds = { ...funds, balance: nextBalance };
    nextAccount.open_positions = nextOpenPositions;
    nextAccount.trade_history = nextHistory;
    return {
      ok: true,
      account: nextAccount,
      response: { closed, balance: nextBalance },
    };
  });
}

export async function handleTradingRequest(
  request: VercelRequest,
  response: VercelResponse
) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const uid = await requireUid(request);
    const body = parseBody(request);
    const action = body.action;

    if (action === 'open') {
      const result = await openPosition(body, uid);
      return response.status(201).json(result);
    }
    if (action === 'close') {
      const result = await closeOne(body, uid);
      return response.status(200).json(result);
    }
    if (action === 'closeAll') {
      const result = await closeAll(body, uid);
      return response.status(200).json(result);
    }
    return response.status(400).json({ error: 'Unsupported trading action.' });
  } catch (error) {
    if (error instanceof ApiError) {
      return response.status(error.status).json({ error: error.message });
    }
    console.error('Trading API request failed:', error);
    return response.status(500).json({ error: 'Trading request could not be completed.' });
  }
}

export default handleTradingRequest;
```
