import { useEffect, useMemo, useState } from 'react';
import { Zap, ArrowUpCircle, ArrowDownCircle, Info } from 'lucide-react';
import { getInstrument } from '@/data/instruments';
import { fmtINR, fmtNum, uid } from '@/lib/format';
import {
  LEVERAGE_MULT,
  leveragesForExchange,
  type Leverage,
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

const LEV_MULT = LEVERAGE_MULT;

export function TradePanel({ symbol, livePrice, walletBalance, onOpenPosition, contract }: TradePanelProps) {
  // Fallback to static instrument finder or use contract metadata if available
  const staticInst = getInstrument(symbol);
  
  const exchange = contract?.exchange || staticInst?.exchange || 'NSE';
  const name = contract?.name || staticInst?.name || symbol;
  const lotSize = Number(contract?.lotsize || 1);

  const availableLevs = leveragesForExchange(exchange);
  const [leverage, setLeverage] = useState<Leverage>(availableLevs[availableLevs.length - 1]);
  const [side, setSide] = useState<OrderSide>('BUY');
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  const [limitPrice, setLimitPrice] = useState<string>(fmtNum(livePrice));
  const [qty, setQty] = useState<string>('1');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Reset leverage to the max allowed whenever the exchange changes.
  useEffect(() => {
    setLeverage(availableLevs[availableLevs.length - 1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exchange]);

  // keep limit price synced when symbol/price changes & order type is market
  const effectivePrice = orderType === 'MARKET' ? livePrice : parseFloat(limitPrice) || livePrice;
  const qtyNum = Math.max(0, Math.floor(parseFloat(qty) || 0));
  const totalUnits = qtyNum * lotSize;

  const mult = LEV_MULT[leverage];
  const notional = effectivePrice * totalUnits;
  const margin = notional / mult;

  const maxQtyByBalance = useMemo(() => {
    if (!walletBalance || effectivePrice <= 0) return 0;
    const maxUnits = Math.floor((walletBalance * mult) / effectivePrice);
    return Math.max(1, Math.floor(maxUnits / lotSize));
  }, [walletBalance, mult, effectivePrice, lotSize]);

  function handleSubmit() {
    setError(null);
    setSuccess(null);
    if (qtyNum <= 0) {
      setError('Enter a valid quantity / lots.');
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
      leverage,
      margin,
      currentPrice: effectivePrice,
    };
    onOpenPosition(pos);
    setSuccess(
      `${side} ${totalUnits} units (${qtyNum} lots) of ${symbol} @ ${fmtNum(effectivePrice)} (${leverage}) placed.`
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
              {fmtNum(livePrice)}
            </div>
            <div className="text-[11px] text-emerald-400 font-mono">▲ Live LTP</div>
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

      {/* Quantity / Lots */}
      <div className="mb-4">
        <label className="mb-1 block text-[11px] uppercase tracking-wider text-gray-500">
          Lots / Quantity {lotSize > 1 ? `(1 Lot = ${lotSize})` : ''}
        </label>
        <input
          type="number"
          min="1"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="w-full rounded-lg border border-white/5 bg-black/40 px-3 py-2 font-mono text-sm text-white focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
        />
        <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
          <span>Max Lots: {maxQtyByBalance.toLocaleString('en-IN')}</span>
          <button
            type="button"
            onClick={() => setQty(String(Math.max(1, Math.floor(maxQtyByBalance / 4))))}
            className="text-accent hover:underline cursor-pointer"
          >
            25%
          </button>
        </div>
      </div>

      {/* Leverage */}
      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-gold" />
            <span className="text-[11px] uppercase tracking-wider text-gray-500">Leverage</span>
          </div>
          <span className="text-[10px] text-gray-600">
            {exchange === 'MCX' ? 'Commodity · up to 500X' : 'Equity/FO · up to 10X'}
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
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="mb-4 space-y-1.5 rounded-xl border border-white/5 bg-black/40 p-3 text-xs">
        <Row label="Total Units / Size" value={`${totalUnits.toLocaleString('en-IN')}`} />
        <Row label="Notional Value" value={fmtINR(notional)} />
        <Row
          label={`Margin (${leverage})`}
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
        disabled={insufficient || qtyNum <= 0}
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
