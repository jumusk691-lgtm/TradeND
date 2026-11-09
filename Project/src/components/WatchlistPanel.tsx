import { Star, X, Inbox, BarChart2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { fmtNum } from '@/lib/format';

// 👉 Exact Render WebSocket URL from APK Engine
const RENDER_WS_URL = "wss://myt-backend-1.onrender.com/ws";

interface WatchlistPanelProps {
  watchlist: any[]; 
  onSelect: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  onOpenChart?: (contract: any) => void;
  selected: string;
}

export function WatchlistPanel({
  watchlist,
  onSelect,
  onRemove,
  onOpenChart,
  selected,
}: WatchlistPanelProps) {
  const [livePrices, setLivePrices] = useState<Record<string, string | number>>({});
  const [prevPrices, setPrevPrices] = useState<Record<string, number>>({});
  const wsRef = useRef<WebSocket | null>(null);

  // Connect directly to Render WebSocket and subscribe using APK logic
  useEffect(() => {
    function connectWS() {
      const ws = new WebSocket(RENDER_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("🟢 Watchlist Connected to Render Live WS (APK Sync)");
        sendSubscriptions(ws);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === "initial_ltps" && data.data) {
            setLivePrices(prev => {
              const numericPrev: Record<string, number> = {};
              Object.keys(data.data).forEach(k => {
                numericPrev[k] = Number(data.data[k]) || 0;
              });
              setPrevPrices(p => ({ ...p, ...numericPrev }));
              return { ...prev, ...data.data };
            });
          } else {
            // Robust APK-style packet parsing for ticks
            const tokenKey = 
              data.instrument_key || 
              data.instrumentKey || 
              data.token || 
              data.t || 
              data.symbol || 
              "";

            const priceStr = 
              data.ltp || 
              data.price || 
              data.last_price || 
              data.cp || 
              data.close || 
              "0.00";

            if (tokenKey) {
              const newPrice = Number(priceStr) || 0;
              const altTokenKey = tokenKey.replace(":", "|");

              setLivePrices(prev => {
                const oldPriceVal = Number(prev[tokenKey] || prev[altTokenKey]) || newPrice;
                setPrevPrices(p => ({
                  ...p,
                  [tokenKey]: oldPriceVal,
                  [altTokenKey]: oldPriceVal,
                }));

                return { 
                  ...prev, 
                  [tokenKey]: newPrice, 
                  [altTokenKey]: newPrice,
                  [data.symbol]: newPrice
                };
              });
            }
          }
        } catch (e) {
          console.error("WS Parse error:", e);
        }
      };

      ws.onerror = (err) => {
        console.error("Watchlist WS Error:", err);
      };

      ws.onclose = () => {
        setTimeout(connectWS, 3000);
      };
    }

    connectWS();

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // Send Watchlist keys/tokens using APK payload format (action: "sub")
  const sendSubscriptions = (wsInstance: WebSocket) => {
    if (wsInstance.readyState === WebSocket.OPEN && watchlist.length > 0) {
      const tokensToSubscribe: string[] = [];

      // Always include Nifty and Sensex like APK
      tokensToSubscribe.push("NSE_INDEX|Nifty 50", "BSE_INDEX|SENSEX");

      watchlist.forEach(w => {
        const tk = w.token || w.instrumentKey || "";
        if (tk && !tokensToSubscribe.includes(tk)) {
          tokensToSubscribe.push(tk);
        }
      });

      if (tokensToSubscribe.length > 0) {
        wsInstance.send(JSON.stringify({
          action: "sub",
          guid: "upstox_sub_request",
          instrumentKeys: tokensToSubscribe,
          tokens: tokensToSubscribe
        }));
        console.log(`📡 Subscribed ${tokensToSubscribe.length} symbols using APK payload`);
      }
    }
  };

  // Re-trigger subscription when watchlist changes
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      sendSubscriptions(wsRef.current);
    }
  }, [watchlist]);

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
          <Star className="h-5 w-5 text-gold fill-gold" />
          Watchlist 
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium text-gray-400">
            {watchlist.length}
          </span>
        </h3>
      </div>

      {watchlist.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
          <Inbox className="h-7 w-7 text-gray-700 mb-2" />
          <p className="text-sm text-gray-500">Your watchlist is empty.</p>
          <p className="text-xs text-gray-600 mt-1">
            Tap the <Star className="inline h-3 w-3" /> icon in the contract browser to add instruments here.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[350px] overflow-y-auto scrollbar-thin">
          {watchlist.map((item) => {
            const sym = item.symbol;
            const name = item.name || sym;
            const exchange = item.exchange || item.exch_seg || 'NSE';
            const tokenKey = item.token || item.instrumentKey || '';
            const altTokenKey = tokenKey.replace(':', '|');

            // Live Price lookup matching APK logic
            const priceVal = 
              (tokenKey && livePrices[tokenKey]) || 
              (altTokenKey && livePrices[altTokenKey]) || 
              (sym && livePrices[sym]) || 
              item.price || 
              0;

            const price = Number(priceVal);
            const oldPrice = prevPrices[tokenKey] || prevPrices[altTokenKey] || prevPrices[sym] || price;
            const isGreen = price >= oldPrice;
            const isSel = selected === sym;

            return (
              <div
                key={tokenKey || sym}
                onClick={() => onSelect(sym)}
                className={`group flex items-center justify-between rounded-xl border p-3 transition-colors cursor-pointer ${
                  isSel
                    ? 'border-accent/40 bg-accent/20'
                    : 'border-white/10 bg-black/40 hover:border-white/20'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {/* Symbol Name bright white and bold */}
                    <span className="text-[15px] font-bold text-white tracking-wide truncate">{name}</span>
                    {item.kind && (
                      <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[10px] font-extrabold text-gold">
                        {item.kind}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-300">
                    <span className="text-gold font-semibold">{exchange}</span>
                    {item.expiry && (
                      <>
                        <span>·</span>
                        <span>Exp: <strong className="text-white">{item.expiry}</strong></span>
                      </>
                    )}
                    {item.lotsize && (
                      <>
                        <span>·</span>
                        <span>Lot: <strong className="text-white">{item.lotsize}</strong></span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    {/* Price with Dynamic Green / Red Color */}
                    <div className={`font-mono text-sm font-bold ${isGreen ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {fmtNum(price)}
                    </div>
                    <div className="font-mono text-[10px] text-gray-400 flex items-center justify-end gap-1">
                      <span className={`h-1.5 w-1.5 rounded-full ${isGreen ? 'bg-emerald-400' : 'bg-rose-400'} animate-pulse`} />
                      Live LTP
                    </div>
                  </div>

                  {/* Open Chart Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(sym);
                      if (onOpenChart) onOpenChart(item);
                    }}
                    className="p-1.5 rounded-lg border border-white/10 bg-black/50 text-accent hover:bg-accent/20 transition-colors cursor-pointer"
                    title="Open Chart"
                  >
                    <BarChart2 className="h-4 w-4" />
                  </button>

                  {/* Remove Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
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
