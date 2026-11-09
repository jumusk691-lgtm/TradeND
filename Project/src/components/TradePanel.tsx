import { useEffect, useMemo, useState, useRef } from 'react';
import { Zap, ArrowUpCircle, ArrowDownCircle, Info } from 'lucide-react';
import { getInstrument } from '@/data/instruments';
import { fmtINR, fmtNum, uid } from '@/lib/format';
import {
  type OrderSide,
  type OrderType,
  type Position,
} from '@/types';

interface TradePanelProps {
  symbol: string;
  livePrice: number;
  walletBalance: number;
  onOpenPosition: (p: Position) => void;
  contract?: any; // Rich contract object from DB (exchange, name, lotsize, etc.)
}

const RENDER_WS_URL = "wss://myt-backend-ghpx.onrender.com/ws";

export function TradePanel({ symbol, livePrice, walletBalance, onOpenPosition, contract }: TradePanelProps) {
  const staticInst = getInstrument(symbol);
  
  const exchange = contract?.exchange || contract?.exch_seg || staticInst?.exchange || 'NSE';
  const name = contract?.name || staticInst?.name || symbol;
  const lotSize = Number(contract?.lotsize || 1);
  const instrumentKey = contract?.instrumentKey || contract?.token || '';

  // 🌟 1. Dynamic Leverage Options based on Exchange (Android App Logic Parity)
  const isMcx = exchange.toUpperCase().includes('MCX');
  const availableLevs = isMcx ? [10, 50, 100, 200, 300, 400, 500] : [1, 3, 5, 7, 8, 10];
  const defaultLev = isMcx ? 100 : 4;

  const [leverage, setLeverage] = useState<number>(defaultLev);
  const [side, setSide] = useState<OrderSide>('BUY');
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  
  // Real-time live price state synced with Render WebSocket
  const [currentLtp, setCurrentLtp] = useState<number>(livePrice || 0);
  const [limitPrice, setLimitPrice] = useState<string>(fmtNum(livePrice || 0));
  
  // 🌟 2. Lot & Quantity States (Matching Android etLot / etQty logic)
  const [lots, setLots] = useState<string>('1');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  // Sync prop livePrice changes
  useEffect(() => {
    if (livePrice > 0) {
      setCurrentLtp(livePrice);
      if (orderType === 'MARKET') {
        setLimitPrice(fmtNum(livePrice));
      }
    }
  }, [livePrice]);

  // Direct WebSocket connection inside TradePanel to guarantee live price streaming
  useEffect(() => {
    function connectWS() {
      const ws = new WebSocket(RENDER_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        const keys = [instrumentKey, symbol].filter(Boolean);
        const tokens = [contract?.token].filter(Boolean);
        ws.send(JSON.stringify({
          action: "sub",
          guid: "tradepanel_live_sub",
          instrumentKeys: keys,
          tokens: tokens
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "initial_ltps" && data.data) {
            const val = data.data[instrumentKey] || data.data[symbol] || data.data[contract?.token];
            if (val) setCurrentLtp(Number(val));
          } else {
            const key = data.instrument_key || data.instrumentKey || data.token || data.symbol || "";
            const ltpVal = data.ltp || data.price || data.last_price || 0;
            if (key && ltpVal) {
              if (key === symbol || key === instrumentKey || key === contract?.token || key.includes(symbol)) {
                setCurrentLtp(Number(ltpVal));
              }
            }
          }
        } catch (e) {
          console.error("TradePanel WS parse error:", e);
        }
      };

      ws.onclose = () => {
        setTimeout(connectWS, 3000);
      };
    }

    connectWS();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [symbol, instrumentKey, contract]);

  // Reset leverage whenever exchange changes
  useEffect(() => {
    setLeverage(isMcx ? 100 : 4);
  }, [exchange, isMcx]);

  const effectivePrice = orderType === 'MARKET' ? currentLtp : parseFloat(limitPrice) || currentLtp;
  
  // 🌟 3. Lot Size & Quantity Calculation Logic (Android App Parity)
  const lotsNum = Math.max(1, parseInt(lots, 10) || 1);
  const totalUnits = lotsNum * lotSize;

  // 🌟 4. Gold Scale Factor Logic (Android getGoldScaleFactor Parity)
  function getGoldScaleFactor(sym: string): number {
    const symUpper = sym.toUpperCase();
    if (symUpper.includes("GOLDM")) return 1.0;
    if (symUpper.includes("GOLD")) return 1000.0;
    return 1.0;
  }

  // 🌟 5. Advanced Scaled Margin Calculation Logic (Matching SymbolDetailsActivity calculateMargin)
  const notional = useMemo(() => {
    const symUpper = symbol.toUpperCase();
    if (symUpper.includes("GOLD") || symUpper.includes("GOLDM")) {
      const scaleFactor = getGoldScaleFactor(symbol);
      return (effectivePrice / 10.0) * totalUnits * scaleFactor;
    }
    return effectivePrice * totalUnits;
  }, [symbol, effectivePrice, totalUnits]);

  const margin = notional / leverage;

  const maxLotsByBalance = useMemo(() => {
    if (!walletBalance || effectivePrice <= 0) return 100;
    const symUpper = symbol.toUpperCase();
    let unitCost = effectivePrice;
    if (symUpper.includes("GOLD") || symUpper.includes("GOLDM")) {
      unitCost = (effectivePrice / 10.0) * getGoldScaleFactor(symbol);
    }
    const maxUnits = Math.floor((walletBalance * leverage) / unitCost);
    return Math.max(1, Math.floor(maxUnits / lotSize));
  }, [walletBalance, leverage, effectivePrice, lotSize, symbol]);

  function handleSubmit() {
    setError(null);
    setSuccess(null);
    if (lotsNum <= 0) {
      setError('Enter a valid lots quantity.');
      return;
    }
    if (margin > walletBalance) {
      setError(
        `Insufficient balance. Margin required ${fmtINR(margin)}, available ${fmtINR(walletBalance)}.`
      );
      return;
    }
    if (orderType === 'LIMIT' && (!limitPrice || parseFloat(limitPrice) <= 0)) {
      setError('Enter a valid limit price.');
      return;
    }

    const pos: Position = {
      id: uid('pos'),
      symbol,
      name: name,
      side,
      qty: totalUnits,
      entryPrice: effectivePrice,
      leverage: `${leverage}x` as any,
      margin,
      currentPrice: effectivePrice,
    };
    onOpenPosition(pos);
    setSuccess(
      `${side} ${totalUnits} units (${lotsNum} lots) of ${symbol} @ ${fmtNum(effectivePrice)} (${leverage}x) placed.`
    );
    setTimeout(() => setSuccess(null), 3500);
  }

  const insufficient = margin > walletBalance;

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg font-bold text-white">Trade Order</h3>
        <span className="rounded-md bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
          {exchange}
        </span>
      </div>

      {/* Symbol + LTP */}
      <div className="mb-4 rounded-xl border border-white/5 bg-black/40 p-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0 pr-2">
            <div className="text-sm font-semibold text-white truncate">{symbol}</div>
            <div className="text-[11px] text-gray-500 truncate">{name} {lotSize > 1 ? `(Lot: ${lotSize})` : ''}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono text-base font-semibold text-white">
              {fmtNum(currentLtp)}
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

      {/* Limit price (conditional) */}
      {orderType === 'LIMIT' && (
        <div className="mb-4">
          <label className="mb-1 block text-[11px] uppercase tracking-wider text-gray-500">
            Limit Price
          </label>
          <input
            type="number"
            value={limitPrice}
            onChange={(e) => setLimitPrice(e.target.value)}
            className="w-full rounded-lg border border-white/5 bg-black/40 px-3 py-2 font-mono text-sm text-white focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        </div>
      )}

      {/* Quantity / Lots (Matching etLot & etQty app logic) */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wider text-gray-500">
            Lots
          </label>
          <input
            type="number"
            min="1"
            value={lots}
            onChange={(e) => setLots(e.target.value)}
            className="w-full rounded-lg border border-white/5 bg-black/40 px-3 py-2 font-mono text-sm text-white focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30 text-center font-bold"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wider text-gray-500">
            Total Qty (Units)
          </label>
          <div className="w-full rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 font-mono text-sm text-gold text-center font-bold flex items-center justify-center">
            {totalUnits.toLocaleString('en-IN')}
          </div>
        </div>
      </div>
      <div className="mb-4 -mt-2 flex items-center justify-between text-[11px] text-gray-500">
        <span>Max Lots: {maxLotsByBalance.toLocaleString('en-IN')}</span>
        <span className="text-gray-400">1 Lot = {lotSize}</span>
      </div>

      {/* Leverage Selection (Dynamic based on MCX / App Logic) */}
      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-gold" />
            <span className="text-[11px] uppercase tracking-wider text-gray-500">Leverage</span>
          </div>
          <span className="text-[10px] text-gray-600">
            {isMcx ? 'Commodity · up to 500X' : 'Equity/FO · up to 10X'}
          </span>
        </div>
        <div className={`grid gap-1.5 ${availableLevs.length > 6 ? 'grid-cols-4' : 'grid-cols-3'}`}>
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
        <Row label="Total Units / Size" value={`${totalUnits.toLocaleString('en-IN')}`} />
        <Row label="Notional Value" value={fmtINR(notional)} />
        <Row
          label={`Margin (${leverage}x)`}
          value={fmtINR(margin)}
          highlight={insufficient ? 'text-rose-400' : 'text-white'}
        />
        <Row label="Available Balance" value={fmtINR(walletBalance)} />
      </div>

      {/* Errors / success */}
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
      <button
        type="button"
        onClick={handleSubmit}
        disabled={insufficient || lotsNum <= 0}
        className={`w-full rounded-xl py-3.5 text-sm font-bold transition-all cursor-pointer ${
          side === 'BUY'
            ? 'bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-40'
            : 'bg-rose-500 text-white hover:bg-rose-400 disabled:opacity-40'
        }`}
      >
        {side} {totalUnits} {symbol} @ {fmtNum(effectivePrice)}
      </button>

      <div className="mt-3 flex items-start gap-1.5 text-[10px] text-gray-500">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        <span>
          Simulated trading environment. Orders open a paper position — no real money is
          transacted.
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
      <span className="text-gray-500">{label}</span>
      <span className={`font-mono ${highlight}`}>{value}</span>
    </div>
  );
}
