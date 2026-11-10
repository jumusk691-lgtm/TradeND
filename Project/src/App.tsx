import { useCallback, useEffect, useState } from 'react';
import { Splash } from '@/components/Splash';
import { Dashboard } from '@/components/Dashboard';
import { SupportModal } from '@/components/SupportModal';
import { Ticker } from '@/components/Ticker';
import { INSTRUMENTS } from '@/data/instruments';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useLivePrices } from '@/hooks/useLivePrices';
import { makeTx } from '@/components/WalletPanel';
import type { DashboardTab, Position, TradeHistoryEntry, WalletTx } from '@/types';
import { signOut } from 'firebase/auth';
import { onValue, orderByChild, equalTo, push, query, ref, remove, set } from 'firebase/database';
import { auth, db } from '@/lib/firebase';

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

function App() {

const [view, setView] = useState<'splash' | 'dashboard'>('splash');
const [supportOpen, setSupportOpen] = useState(false);

const [walletBalance, setWalletBalance] = useState<number>(STARTING_BALANCE);
const [positions, setPositions] = useState<Position[]>([]);
const [tradeHistory, setTradeHistory] = useState<TradeHistoryEntry[]>([]);

const [watchlist, setWatchlist] =
usePersistentState<any[]>('tradend:watchlist', []);

const [transactions, setTransactions] =
usePersistentState<WalletTx[]>('tradend:txns', []);

const [activeTab, setActiveTab] =
usePersistentState<DashboardTab>('tradend:tab', 'markets');

// =====================================================
// 1. FIREBASE TRADING ACCOUNT LISTENERS
// =====================================================

useEffect(() => {
  const currentUid = localStorage.getItem('tradend:uid');
  if (!currentUid) {
    setWalletBalance(STARTING_BALANCE);
    setPositions([]);
    setTradeHistory([]);
    return;
  }

  const accountPath = `users_details/${currentUid}`;
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
    onValue(ref(db, `${accountPath}/trade_history`), (snapshot) => {
      const records = snapshot.val();
      const nextHistory = records && typeof records === 'object'
        ? Object.entries(records).map(([id, value]) => ({
            ...(value as Record<string, unknown>),
            id: String((value as Record<string, unknown>).id ?? id),
          } as TradeHistoryEntry)).sort((a, b) => b.closedAt - a.closedAt)
        : [];
      setTradeHistory(nextHistory);
    }, (error) => console.error('Firebase history fetch error:', error)),
  ];

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}, [view]);

// =====================================================
// 2. FIREBASE WATCHLIST LISTENER
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
// 9. SERVER-AUTHORITATIVE POSITION ACTIONS
// =====================================================

const openPosition = useCallback(async (position: Position) => {
  await sendTradingRequest({
    action: 'open',
    symbol: position.symbol,
    name: position.name,
    side: position.side,
    qty: position.qty,
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
      <Ticker livePrices={livePrices} />  

      <Dashboard  
        activeTab={activeTab}  
        onTabChange={setActiveTab}  

        walletBalance={walletBalance}  

        watchlist={watchlist}  

        positions={positions}
        tradeHistory={tradeHistory}
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

export default App;
