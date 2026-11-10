import { useCallback, useEffect, useState } from 'react';
import { Splash } from '@/components/Splash';
import { Dashboard } from '@/components/Dashboard';
import { SupportModal } from '@/components/SupportModal';
import { Ticker } from '@/components/Ticker';
import { INSTRUMENTS } from '@/data/instruments';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useLivePrices } from '@/hooks/useLivePrices';
import { makeTx } from '@/components/WalletPanel';
import { uid as createId } from '@/lib/format';
import { calculatePositionPnl } from '@/lib/trading';
import type { DashboardTab, Position, TradeHistory, WalletTx } from '@/types';

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
} from 'firebase/database';

// Firebase configuration
const firebaseConfig = {
databaseURL: "https://trade-f600a-default-rtdb.firebaseio.com/"
};

const app = getApps().length === 0
? initializeApp(firebaseConfig)
: getApps()[0];

const db = getDatabase(app);

const STARTING_BALANCE = 50000;

function App() {
const [view, setView] = useState<'splash' | 'dashboard'>('splash');
const [supportOpen, setSupportOpen] = useState(false);

// Persistent states
const [walletBalance, setWalletBalance] =
usePersistentState<number>('tradend:wallet', STARTING_BALANCE);

const [watchlist, setWatchlist] =
usePersistentState<any[]>('tradend:watchlist', []);

const [positions, setPositions] =
usePersistentState<Position[]>('tradend:positions', []);

const [transactions, setTransactions] =
usePersistentState<WalletTx[]>('tradend:txns', []);

const [tradeHistory, setTradeHistory] = useState<TradeHistory[]>([]);
const [showTradeHistory, setShowTradeHistory] = useState(true);

const [activeTab, setActiveTab] =
usePersistentState<DashboardTab>('tradend:tab', 'markets');

// =====================================================
// 1. FIREBASE BALANCE LISTENER
// =====================================================

useEffect(() => {
const currentUid = localStorage.getItem('tradend:uid');

if (!currentUid) return;  

const balanceRef = ref(  
  db,  
  `users_details/${currentUid}/funds/balance`  
);  

const unsubscribe = onValue(  
  balanceRef,  
  (snapshot) => {  
    const serverBalance = snapshot.val();  

    if (serverBalance !== null && serverBalance !== undefined) {  
      const parsedBal = Number(serverBalance);  

      if (Number.isFinite(parsedBal)) {  
        setWalletBalance(parsedBal);  
      }  
    }  
  },  
  (error) => {  
    console.error('Firebase balance fetch error:', error);  
  }  
);  

return () => unsubscribe();

}, [view, setWalletBalance]);

// =====================================================
// 2. FIREBASE TRADE HISTORY + VISIBILITY
// =====================================================
useEffect(() => {
  const currentUid = localStorage.getItem('tradend:uid');
  if (!currentUid) {
    setTradeHistory([]);
    setShowTradeHistory(true);
    return;
  }

  const historyRef = ref(db, `users_details/${currentUid}/trade_history`);
  const visibilityRef = ref(db, `users_details/${currentUid}/preferences/showTradeHistory`);
  const unsubHistory = onValue(historyRef, (snapshot) => {
    const history: TradeHistory[] = [];
    snapshot.forEach((child) => {
      const value = child.val();
      if (value) history.push(value as TradeHistory);
    });
    history.sort((a, b) => String(b.closedAt).localeCompare(String(a.closedAt)));
    setTradeHistory(history);
  });
  const unsubVisibility = onValue(visibilityRef, (snapshot) => {
    const value = snapshot.val();
    if (typeof value === 'boolean') setShowTradeHistory(value);
  });
  return () => { unsubHistory(); unsubVisibility(); };
}, [view]);

// =====================================================
// 3. FIREBASE WATCHLIST LISTENER
// =====================================================

useEffect(() => {
const currentUid = localStorage.getItem('tradend:uid');

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

}, [view, setWatchlist]);

// =====================================================
// 3. LIVE MARKET PRICES
// =====================================================

const seeds: Record<string, number> = {};

for (const instrument of INSTRUMENTS) {
seeds[instrument.symbol] = instrument.price;
}

const livePrices = useLivePrices(seeds, 2200);

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

const currentUid = localStorage.getItem('tradend:uid');  

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

setWatchlist([]);  

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

  const currentUid = localStorage.getItem('tradend:uid');  

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
// 9. OPEN POSITION
// =====================================================

const openPosition = useCallback(
(p: Position) => {
  const safeMargin = Math.max(0, Number(p.margin) || 0);
  const safePosition: Position = {
    ...p,
    margin: safeMargin,
    maxLoss: safeMargin,
    status: 'OPEN',
    openedAt: new Date().toISOString(),
  };

  setPositions((prev) => [...prev, safePosition]);
  setWalletBalance((balance) => Math.max(0, balance - safeMargin));
},
[setPositions, setWalletBalance]
);

// =====================================================
// 10. CLOSE POSITION
// =====================================================

const closePosition = useCallback(
(id: string, reason: 'EXIT' | 'EXIT_ALL' = 'EXIT') => {
  setPositions((prev) => {
    const pos = prev.find((p) => p.id === id);
    if (!pos) return prev;
    const cur = livePrices[pos.symbol] ?? pos.currentPrice;
    const pnl = calculatePositionPnl(pos, cur);
    const uid = localStorage.getItem('tradend:uid');
    const history: TradeHistory = {
      id: createId('trade'), positionId: pos.id, symbol: pos.symbol, name: pos.name,
      side: pos.side, qty: pos.qty, buyPrice: pos.side === 'BUY' ? pos.entryPrice : cur,
      sellPrice: pos.side === 'BUY' ? cur : pos.entryPrice, pnl, margin: pos.margin,
      closedAt: new Date().toISOString(), reason,
    };
    if (uid) set(push(ref(db, `users_details/${uid}/trade_history`)), history);
    setWalletBalance((balance) => Math.max(0, balance + pos.margin + pnl));
    setTradeHistory((items) => [history, ...items]);
    return prev.filter((item) => item.id !== id);
  });
}, [setPositions, setWalletBalance, livePrices]);

const closeAllPositions = useCallback(() => {
  positions.forEach((position) => closePosition(position.id, 'EXIT_ALL'));
}, [positions, closePosition]);

const setTradeHistoryVisibility = useCallback((visible: boolean) => {
  setShowTradeHistory(visible);
  const uid = localStorage.getItem('tradend:uid');
  if (uid) set(ref(db, `users_details/${uid}/preferences/showTradeHistory`), visible);
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
        onCloseAllPositions={closeAllPositions}
        tradeHistory={tradeHistory}
        showTradeHistory={showTradeHistory}
        onToggleTradeHistory={setTradeHistoryVisibility}

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
