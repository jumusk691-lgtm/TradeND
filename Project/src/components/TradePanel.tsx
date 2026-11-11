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
  getGoldContractGrams,
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

  // =========================================
  // APK GOLD SCALE FACTOR
  // =========================================

  function getGoldScaleFactor(sym: string): number {
    const upper = sym.toUpperCase();

    if (upper.includes('GOLDM')) return 1;

    if (upper.includes('GOLD')) return 1000;

    return 1;
  }

  const scaleFactor = getGoldScaleFactor(symbol);

  const isGold =
    symbol.toUpperCase().includes('GOLD');

  const contractGrams = getGoldContractGrams(symbol);

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

  // Robust grams per lot based on specific contract type
  const actualGramsPerLot = contractGrams > 0 ? contractGrams : lotSize;
  const totalUnits = lotsNum * lotSize;
  const totalGrams = lotsNum * actualGramsPerLot;

  const quantityLabel = contractGrams > 0
    ? `${lotsNum} lots × ${contractGrams}g = ${totalGrams.toLocaleString('en-IN')}g`
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
    
    const upper = symbol.toUpperCase();
    let pricePerGram = effectivePrice;

    if (upper.includes('GOLDPETAL')) {
      pricePerGram = effectivePrice; // 1g = 1g price
    } else if (upper.includes('GOLDGUINEA')) {
      pricePerGram = effectivePrice / 8; // 8g price
    } else if (upper.includes('GOLDTEN')) {
      pricePerGram = effectivePrice / 10; // 10g price
    } else if (upper.includes('GOLDM')) {
      pricePerGram = effectivePrice / 10; // 10g base quotation
    } else if (upper.includes('GOLD')) {
      pricePerGram = effectivePrice / 10; // Standard 1kg contract quoted per 10g
    }

    // Formula: Total Grams × Price per Gram
    return totalGrams * pricePerGram;
  }, [symbol, effectivePrice, totalGrams]);

  const estimatedMargin = calculateMargin(notional, leverage);
  const marginRequest = useMemo<MarginRequest | null>(() => {
    if (!instrumentKey || effectivePrice <= 0 || totalUnits <= 0) return null;
    return {
      instrumentKey,
      quantity: totalUnits,
      transactionType: side,
      product: product === 'DELIVERY' ? 'D' : 'I',
      price: effectivePrice,
    };
  }, [instrumentKey, effectivePrice, totalUnits, side, product]);

  const { data: marginData, error: marginError, isLoading: marginLoading } = useSWR<MarginResult>(
    marginRequest ? ['upstox-margin', marginRequest] : null,
    ([, request]) => fetchUpstoxMargin(request as MarginRequest),
    { keepPreviousData: false, revalidateOnFocus: false }
  );
  const requiredMargin = marginData?.finalMargin ?? 0;

  // =========================================
  // MAX LOTS BY BALANCE
  // =========================================

  const maxLotsByBalance = useMemo(() => {

    if (
      !walletBalance ||
      effectivePrice <= 0 ||
      leverage <= 0
    ) {
      return 0;
    }

    const upper = symbol.toUpperCase();
    let pricePerGram = effectivePrice;
    if (upper.includes('GOLDGUINEA')) pricePerGram = effectivePrice / 8;
    else if (upper.includes('GOLDTEN') || upper.includes('GOLDM') || upper.includes('GOLD')) pricePerGram = effectivePrice / 10;

    const costPerLot = contractGrams > 0 ? actualGramsPerLot * pricePerGram : effectivePrice * lotSize;
    if (costPerLot <= 0) return 0;

    return Math.floor((walletBalance * leverage) / costPerLot);

  }, [
    walletBalance,
    leverage,
    effectivePrice,
    lotSize,
    contractGrams,
    actualGramsPerLot,
    symbol
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

    if (marginLoading || marginError || !marginData) {
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
      buy_price: effectivePrice,
      margin_blocked: requiredMargin,
      scale_factor: scaleFactor,
      status: 'OPEN',
      instrumenttype: contract?.instrumenttype ?? contract?.kind ?? '',
      tick_size: contract?.tick_size ?? null,
      timestamp: Date.now(),
    };

    setIsSubmitting(true);
    try {
      await onOpenPosition(positionData as Position);
      setSuccess(`${side} ${totalGrams}g (${lotsNum} lots) of ${symbol} @ ${fmtNum(effectivePrice)} (${leverage}x) ${product} placed.`);
      setTimeout(() => setSuccess(null), 3500);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The order could not be placed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const insufficient =
    !marginData ||
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
              {name} {lotSize > 1 ? `(1 Lot = ${lotSize})` : ''}
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
            TOTAL QTY (UNITS)
          </label>

          <div className="w-full rounded-lg border border-gold/40 bg-gold/10 px-3 py-2.5 font-mono text-base text-gold text-center font-bold flex items-center justify-center shadow-inner">
            {totalGrams.toLocaleString('en-IN')}g
          </div>
        </div>

      </div>

      <div className="mb-4 -mt-2 flex items-center justify-between text-[11px]">
        <span className="text-gray-500">
          Max Lots: {maxLotsByBalance.toLocaleString('en-IN')}
        </span>

        <span className="text-gold font-bold">
          1 Lot = {actualGramsPerLot}g
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
          label="Quantity × per lot"
          value={quantityLabel}
        />

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
          value={marginLoading ? 'Calculating…' : marginData ? fmtINR(requiredMargin) : 'Unavailable'}
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
        {marginLoading ? 'Calculating live Upstox margin…' : marginData ? `${side} margin required: ${fmtINR(requiredMargin)}` : 'Live margin unavailable'}
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={
          isSubmitting ||
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
        {isSubmitting ? 'Submitting order…' : `${side} ${totalGrams}g ${symbol} @ ${fmtNum(effectivePrice)}`}
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
