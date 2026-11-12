# TradeND — Complete Current Source Files

The following five files are copied in full from the current `main` checkout. Each code block contains the complete file contents.

## `Project/src/components/TradePanel.tsx`

```tsx
import { useEffect, useMemo, useState, useRef } from 'react';
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

import {
  type OrderSide,
  type OrderType,
  type Position,
} from '@/types';

interface TradePanelProps {
  symbol: string;
  livePrice: number;
  walletBalance: number;
  onOpenPosition: (p: Position) => Promise<void>;
  contract?: any;
}

const RENDER_WS_URL = 'wss://myt-backend-1.onrender.com/ws';

type ProductType = 'INTRADAY' | 'DELIVERY';

export function TradePanel({
  symbol,
  livePrice,
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

  useEffect(() => {
    setLeverage(defaultLev);
  }, [defaultLev]);

  const wsRef = useRef<WebSocket | null>(null);

  const reconnectTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const mountedRef = useRef(true);

  // =========================================
  // LIVE PRICE SYNC
  // =========================================

  useEffect(() => {
    if (livePrice > 0) {
      setCurrentLtp(livePrice);

      if (orderType === 'MARKET') {
        setLimitPrice(fmtNum(livePrice));
      }
    }
  }, [livePrice, orderType]);

  // =========================================
  // RESET WHEN CONTRACT CHANGES
  // =========================================

  useEffect(() => {
    setLeverage(defaultLev);
    setLots('1');
    setSide('BUY');
    setOrderType('MARKET');
    setProduct('INTRADAY');
    setError(null);
    setSuccess(null);

    if (livePrice > 0) {
      setCurrentLtp(livePrice);
      setLimitPrice(fmtNum(livePrice));
    }
  }, [symbol, token, exchange, defaultLev]);

  // =========================================
  // DIRECT WEBSOCKET LIVE LTP
  // =========================================

  useEffect(() => {
    mountedRef.current = true;

    let shouldReconnect = true;

    function connectWS() {
      if (!shouldReconnect) return;

      let ws: WebSocket;

      try {
        ws = new WebSocket(RENDER_WS_URL);
        wsRef.current = ws;
      } catch (error) {
        console.error('TradePanel WebSocket error:', error);

        reconnectTimerRef.current = setTimeout(
          connectWS,
          3000
        );

        return;
      }

      ws.onopen = () => {
        const keys = [
          instrumentKey,
          symbol,
          token
        ].filter(Boolean);

        const tokens = [
          token,
          instrumentKey
        ].filter(Boolean);

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            action: 'sub',
            guid: 'tradepanel_direct_sub',
            instrumentKeys: keys,
            tokens
          }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'initial_ltps' && data.data) {
            const value =
              data.data[instrumentKey] ??
              data.data[symbol] ??
              data.data[token];

            if (value !== undefined && Number(value) > 0) {
              setCurrentLtp(Number(value));
            }

            return;
          }

          const key = String(
            data.instrument_key ||
            data.instrumentKey ||
            data.token ||
            data.symbol ||
            ''
          );

          const ltpValue =
            data.ltp ??
            data.price ??
            data.last_price ??
            0;

          if (!key || Number(ltpValue) <= 0) return;

          const matches =
            key === symbol ||
            key === instrumentKey ||
            key === token;

          if (matches) {
            setCurrentLtp(Number(ltpValue));
          }

        } catch (error) {
          console.error(
            'TradePanel WS parse error:',
            error
          );
        }
      };

      ws.onerror = (error) => {
        console.error('TradePanel WebSocket error:', error);
      };

      ws.onclose = () => {
        if (shouldReconnect) {
          reconnectTimerRef.current = setTimeout(
            connectWS,
            3000
          );
        }
      };
    }

    connectWS();

    return () => {
      shouldReconnect = false;

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }

      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };

  }, [symbol, token, instrumentKey]);

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

            <div className="text-[11px] text-emerald-400 font-mono flex items-center justify-end gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live LTP
            </div>
          </div>

        </div>
      </div>

      {/* Side toggle */}

      <div className="mb-4 grid grid-cols-2 gap-2">

        <button
          type="button"
          onClick={() => setSide('BUY')}
          className={`flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all cursor-pointer ${
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
          onClick={() => setSide('SELL')}
          className={`flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all cursor-pointer ${
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

## `Project/src/lib/tradingMath.ts`

```ts
import type { OrderSide } from '../types';

export interface PnlPosition {
  symbol: string;
  side: OrderSide;
  qty: number;
  entryPrice: number;
  margin: number;
  contractMultiplier?: number;
}

export function roundCurrency(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  const direction = amount < 0 ? -1 : 1;
  return Math.round((amount + direction * Number.EPSILON) * 100) / 100;
}

export function getGoldContractGrams(symbol: string): number {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalized.includes('GOLDPETAL')) return 1;
  if (normalized.includes('GOLDGUINEA')) return 8;
  if (normalized.includes('GOLDTEN')) return 10;
  if (normalized.includes('GOLDM')) return 100;
  if (normalized.includes('GOLD')) return 1000;
  return 0;
}

function getGoldQuoteGrams(symbol: string): number {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalized.includes('GOLDPETAL')) return 1;
  if (normalized.includes('GOLDGUINEA')) return 8;
  return 10;
}

export function getPricePerGram(symbol: string, price: number): number {
  return getGoldContractGrams(symbol) > 0
    ? price / getGoldQuoteGrams(symbol)
    : price;
}

export function getContractMultiplier(symbol: string): number {
  const gramsPerLot = getGoldContractGrams(symbol);
  return gramsPerLot > 0 ? gramsPerLot / getGoldQuoteGrams(symbol) : 1;
}

export function calculateNotional(
  symbol: string,
  price: number,
  quantity: number
): number {
  const gramsPerLot = getGoldContractGrams(symbol);
  const notional = gramsPerLot > 0
    ? quantity * gramsPerLot * getPricePerGram(symbol, price)
    : price * quantity;
  return roundCurrency(notional);
}

export function calculateMargin(notional: number, leverage: number): number {
  if (!Number.isFinite(notional) || !Number.isFinite(leverage) || leverage <= 0) {
    return 0;
  }
  return roundCurrency(notional / leverage);
}

export const OPTION_SELL_MARGIN_PER_LOT = 120_000;

export function calculateOptionSellMargin(lots: number): number {
  if (!Number.isSafeInteger(lots) || lots < 1) return 0;
  return roundCurrency(OPTION_SELL_MARGIN_PER_LOT * lots);
}

export function calculateGrossPnl(
  position: PnlPosition,
  exitPrice: number
): number {
  const direction = position.side === 'BUY' ? 1 : -1;
  const multiplier = position.contractMultiplier ?? getContractMultiplier(position.symbol);
  return roundCurrency(
    (exitPrice - position.entryPrice) * position.qty * direction * multiplier
  );
}

export function calculateCappedPnl(
  position: PnlPosition,
  exitPrice: number
): number {
  const grossPnl = calculateGrossPnl(position, exitPrice);
  const margin = Math.max(0, roundCurrency(position.margin));
  return Math.max(-margin, grossPnl);
}

export function calculateReturnOnMargin(pnl: number, margin: number): number {
  if (!Number.isFinite(margin) || margin <= 0) return 0;
  return (pnl / margin) * 100;
}
```

## `Project/src/App.tsx`

```tsx
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
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { onValue, orderByChild, equalTo, push, query, ref, remove, set } from 'firebase/database';
import { auth, db } from '@/lib/firebase';
import { normalizeTradeHistory } from '@/lib/tradeHistory';

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
      <Ticker livePrices={livePrices} />  

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

export default App;
```

## `Project/src/types.ts`

```ts
export type Trend = 'up' | 'down';

export type Exchange = 'NSE' | 'BSE' | 'MCX';

export interface MarketInstrument {
  symbol: string;
  name: string;
  exchange: Exchange;
  price: number;
  changePct: number;
  changeAbs: number;
  trend: Trend;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  volume: string;
  lotSize?: number;
}

export type DerivativeKind = 'FUT' | 'CE' | 'PE' | 'INDEX';

export interface DerivativeContract extends MarketInstrument {
  kind: DerivativeKind;
  underlying: string;
  expiry: string;
  strike?: number;
  token?: string;
  instrumentKey?: string;
  lotsize?: number;
  exch_seg?: string;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type Timeframe = '1M' | '3M' | '5M' | '15M' | '30M' | '1H' | '1D' | '1W' | '60D';

// Indian equity markets (NSE/BSE) support 1X–10X leverage.
export type EquityLeverage = '1X' | '2X' | '3X' | '5X' | '7X' | '10X';
// Commodity markets (MCX) support 10X–500X leverage.
export type CommodityLeverage =
  | '10X'
  | '25X'
  | '50X'
  | '100X'
  | '200X'
  | '300X'
  | '400X'
  | '500X';

export type Leverage = EquityLeverage | CommodityLeverage;

export type OrderSide = 'BUY' | 'SELL';

export type OrderType = 'MARKET' | 'LIMIT';

export interface Position {
  id: string;
  symbol: string;
  name: string;
  side: OrderSide;
  qty: number;
  lots?: number;
  lotSize?: number;
  kind?: DerivativeKind;
  entryPrice: number;
  leverage: Leverage;
  margin: number;
  currentPrice: number;
  contractMultiplier?: number;
  openedAt?: number;
  exchange?: string;
  product?: 'INTRADAY' | 'DELIVERY';
  orderType?: OrderType;
}

export interface TradeHistoryEntry {
  id: string;
  symbol: string;
  name: string;
  side: OrderSide;
  qty: number;
  buyPrice: number;
  sellPrice: number;
  entryPrice: number;
  exitPrice: number;
  margin: number;
  realizedPnl: number;
  closedAt: number;
  openedAt: number;
  leverage: string;
  contractMultiplier?: number;
}

// 🌟 Updated WatchlistItem to support token, lotsize, exchange, etc.
export interface WatchlistItem {
  symbol: string;
  name?: string;
  exchange?: Exchange | string;
  exch_seg?: string;
  token?: string;
  instrumentKey?: string;
  lotsize?: number;
  expiry?: string;
  kind?: DerivativeKind | string;
  addedAt?: number;
  price?: number;
}

export interface WalletTx {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAW';
  amount: number;
  status: 'PENDING' | 'COMPLETED' | 'REJECTED';
  date: string;
  method: string;
}

export interface SessionState {
  walletBalance: number;
  watchlist: (WatchlistItem | string)[];
  positions: Position[];
  transactions: WalletTx[];
  activeTab: DashboardTab;
}

export type DashboardTab = 'markets' | 'wallet' | 'positions';

export const EXCHANGES: Exchange[] = ['NSE', 'BSE', 'MCX'];
export const TIMEFRAMES: Timeframe[] = ['1M', '3M', '5M', '15M', '30M', '1H', '1D', '1W', '60D'];

export const EQUITY_LEVERAGES: EquityLeverage[] = ['1X', '2X', '3X', '5X', '7X', '10X'];
export const COMMODITY_LEVERAGES: CommodityLeverage[] = [
  '10X',
  '25X',
  '50X',
  '100X',
  '200X',
  '300X',
  '400X',
  '500X',
];

export const LEVERAGE_MULT: Record<Leverage, number> = {
  '1X': 1,
  '2X': 2,
  '3X': 3,
  '5X': 5,
  '7X': 7,
  '10X': 10,
  '25X': 25,
  '50X': 50,
  '100X': 100,
  '200X': 200,
  '300X': 300,
  '400X': 400,
  '500X': 500,
};

export function leveragesForExchange(ex: Exchange): Leverage[] {
  return ex === 'MCX' ? COMMODITY_LEVERAGES : EQUITY_LEVERAGES;
}

export const APK_URL =
  'https://drive.google.com/uc?export=download&id=1HwT-fhdOqWFS05f7JUoD1aP-x9ogjii8';
```

