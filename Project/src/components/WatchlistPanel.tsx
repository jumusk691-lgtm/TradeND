import { Star, X, Inbox, Activity } from 'lucide-react';
import { fmtNum, fmtPct } from '@/lib/format';

interface WatchlistPanelProps {
  watchlist: any[]; 
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
  // Live WS Data count for debugging
  const activeKeysCount = Object.keys(livePrices).length;

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
          <Star className="h-5 w-5 text-gold" />
          Watchlist & Live LTP Checker
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium text-gray-400">
            {watchlist.length}
          </span>
        </h3>
        
        {/* Live WS Status Badge */}
        <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 text-[11px] text-emerald-400 font-mono">
          <Activity className="h-3.5 w-3.5 animate-pulse" />
          <span>WS Keys: {activeKeysCount}</span>
        </div>
      </div>

      {watchlist.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
          <Inbox className="h-7 w-7 text-gray-700 mb-2" />
          <p className="text-sm text-gray-500">Your watchlist is empty.</p>
          <p className="text-xs text-gray-600 mt-1">
            Tap the <Star className="inline h-3 w-3" /> icon in the markets table to add instruments and test live LTP.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-80 overflow-y-auto scrollbar-thin">
          {watchlist.map((item) => {
            const isObj = typeof item === 'object' && item !== null;
            const sym = isObj ? item.symbol : item;
            const name = isObj ? item.name : sym;
            const exchange = isObj ? item.exchange : 'NSE';
            const instrumentKey = isObj ? item.instrumentKey : '';
            const token = isObj ? item.token : '';

            // Fetch Live Price using instrumentKey, token, or symbol from WS cache
            const priceVal = 
              (instrumentKey && livePrices[instrumentKey]) || 
              (token && livePrices[token]) || 
              (sym && livePrices[sym]) || 
              (isObj && item.price) || 
              0;

            const price = Number(priceVal);
            const prevClose = (isObj && item.prevClose) || price || 1;
            const chgAbs = price - prevClose;
            const chgPct = prevClose > 0 ? (chgAbs / prevClose) * 100 : 0;
            const up = chgAbs >= 0;
            const isSel = selected === sym;

            return (
              <div
                key={instrumentKey || token || sym}
                className={`group flex items-center justify-between rounded-xl border p-3 transition-colors ${
                  isSel
                    ? 'border-accent/30 bg-accent/10'
                    : 'border-white/5 bg-black/30 hover:border-white/10'
                }`}
              >
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onSelect(sym)}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white truncate">{name}</span>
                    {isObj && item.kind && (
                      <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-extrabold text-accent-200">
                        {item.kind}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                    <span className="text-gold font-medium">{exchange}</span>
                    {isObj && item.expiry && (
                      <>
                        <span>·</span>
                        <span>Exp: <strong className="text-white">{item.expiry}</strong></span>
                      </>
                    )}
                    {isObj && item.lotsize && (
                      <>
                        <span>·</span>
                        <span>Lot: <strong className="text-white">{item.lotsize}</strong></span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="font-mono text-sm font-semibold text-white">
                      {fmtNum(price)}
                    </div>
                    <div className="font-mono text-[11px] text-emerald-400 flex items-center justify-end gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                      Live LTP
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
