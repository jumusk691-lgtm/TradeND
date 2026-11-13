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
