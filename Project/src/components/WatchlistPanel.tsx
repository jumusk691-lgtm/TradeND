import { Star, X, Inbox } from 'lucide-react';
import { getInstrument } from '@/data/instruments';
import { fmtNum, fmtPct } from '@/lib/format';

interface WatchlistPanelProps {
  watchlist: any[]; // Supports both string symbols and rich contract objects from DB
  livePrices: Record<string, string | number>;
  onSelect: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  selected: string;
}

export function WatchlistPanel({
  watchlist,
  livePrices,
  onRemove,
  selected,
}: WatchlistPanelProps) {
  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <h3 className="font-display text-lg font-bold text-white flex items-center gap-2 mb-3">
        <Star className="h-5 w-5 text-gold" />
        Watchlist
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium text-gray-400">
          {watchlist.length}
        </span>
      </h3>

      {watchlist.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
          <Inbox className="h-7 w-7 text-gray-700 mb-2" />
          <p className="text-sm text-gray-500">Your watchlist is empty.</p>
          <p className="text-xs text-gray-600 mt-1">
            Tap the <Star className="inline h-3 w-3" /> icon in the markets table to add instruments.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-80 overflow-y-auto scrollbar-thin">
          {watchlist.map((item) => {
            // Handle both rich contract object or string symbol
            const isObj = typeof item === 'object' && item !== null;
            const sym = isObj ? item.symbol : item;
            const name = isObj ? item.name : sym;
            const exchange = isObj ? item.exchange : 'NSE';
            const instrumentKey = isObj ? item.instrumentKey : '';
            const token = isObj ? item.token : '';

            // Fallback to static instrument data if needed
            const inst = getInstrument(sym);

            // Fetch Live Price from Render WebSocket cache using instrumentKey, token, or symbol
            const priceVal = 
              (instrumentKey && livePrices[instrumentKey]) || 
              (token && livePrices[token]) || 
              (sym && livePrices[sym]) || 
              inst.price || 
              0;

            const price = Number(priceVal);
            const prevClose = inst.prevClose || price || 1;
            const chgAbs = price - prevClose;
            const chgPct = (chgAbs / prevClose) * 100;
            const up = chgAbs >= 0;
            const isSel = selected === sym;

            return (
              <div
                key={instrumentKey || sym}
                className={`group flex items-center justify-between rounded-lg border px-3 py-2 transition-colors ${
                  isSel
                    ? 'border-accent/30 bg-accent/10'
                    : 'border-white/5 bg-black/30 hover:border-white/10'
                }`}
              >
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onSelect(sym)}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white truncate">{name}</span>
                    {isObj && item.kind && (
                      <span className="rounded bg-accent/20 px-1 py-0.2 text-[9px] font-bold text-accent-200">
                        {item.kind}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-gray-500">
                    <span>{exchange}</span>
                    {isObj && item.expiry && (
                      <>
                        <span>·</span>
                        <span>{item.expiry}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="font-mono text-sm text-white">{fmtNum(price)}</div>
                    <div
                      className={`font-mono text-[11px] ${up ? 'text-emerald-400' : 'text-rose-400'}`}
                    >
                      {up ? '▲' : '▼'} {fmtPct(chgPct)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(sym);
                    }}
                    className="rounded p-1 text-gray-600 opacity-0 group-hover:opacity-100 hover:bg-rose-500/10 hover:text-rose-400 transition-all cursor-pointer"
                    aria-label="Remove from watchlist"
                  >
                    <X className="h-3.5 w-3.5" />
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
