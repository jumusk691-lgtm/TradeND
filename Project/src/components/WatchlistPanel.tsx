import { Star, X, Inbox, Activity, BarChart2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { fmtNum } from '@/lib/format';

// 👉 Render WebSocket URL for Live LTP & Chart streaming
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
  const wsRef = useRef<WebSocket | null>(null);

  // Connect directly to Render WebSocket and subscribe to Watchlist items
  useEffect(() => {
    function connectWS() {
      const ws = new WebSocket(RENDER_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("🟢 Watchlist Connected to Render Live WS");
        sendSubscriptions(ws);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "initial_ltps" && data.data) {
            setLivePrices(prev => ({ ...prev, ...data.data }));
          } else if (data.instrument_key && data.ltp) {
            const tokenPart = data.instrument_key.split('|')[1];
            setLivePrices(prev => ({ 
              ...prev, 
              [data.instrument_key]: data.ltp, 
              [tokenPart]: data.ltp,
              [data.token]: data.ltp 
            }));
          } else if (data.token && data.ltp) {
            setLivePrices(prev => ({ ...prev, [data.token]: data.ltp }));
          } else if (data.symbol && data.ltp) {
            setLivePrices(prev => ({ ...prev, [data.symbol]: data.ltp }));
          } else {
            setLivePrices(prev => ({ ...prev, ...data }));
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

  // Send Watchlist keys/tokens to Render WebSocket whenever watchlist updates
  const sendSubscriptions = (wsInstance: WebSocket) => {
    if (wsInstance.readyState === WebSocket.OPEN && watchlist.length > 0) {
      const keys = watchlist.map(w => w.instrumentKey).filter(Boolean);
      const tokens = watchlist.map(w => w.token).filter(Boolean);

      wsInstance.send(JSON.stringify({
        action: "subscribe",
        instrumentKeys: keys,
        tokens: tokens
      }));
      console.log(`📡 Subscribed ${keys.length} watchlist symbols to Render WS`);
    }
  };

  // Re-trigger subscription when watchlist changes
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      sendSubscriptions(wsRef.current);
    }
  }, [watchlist]);

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
            Tap the <Star className="inline h-3 w-3" /> icon in the contract browser to add instruments here.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[350px] overflow-y-auto scrollbar-thin">
          {watchlist.map((item) => {
            const sym = item.symbol;
            const name = item.name || sym;
            const exchange = item.exchange || 'NSE';
            const instrumentKey = item.instrumentKey || '';
            const token = item.token || '';

            // Live Price lookup from Render WS stream
            const priceVal = 
              (instrumentKey && livePrices[instrumentKey]) || 
              (token && livePrices[token]) || 
              (sym && livePrices[sym]) || 
              item.price || 
              0;

            const price = Number(priceVal);
            const isSel = selected === sym;

            return (
              <div
                key={instrumentKey || token || sym}
                onClick={() => onSelect(sym)} // Click to select for trading / order panel
                className={`group flex items-center justify-between rounded-xl border p-3 transition-colors cursor-pointer ${
                  isSel
                    ? 'border-accent/30 bg-accent/10'
                    : 'border-white/5 bg-black/30 hover:border-white/10'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white truncate">{name}</span>
                    {item.kind && (
                      <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-extrabold text-accent-200">
                        {item.kind}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                    <span className="text-gold font-medium">{exchange}</span>
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
                    <div className="font-mono text-sm font-semibold text-white">
                      {fmtNum(price)}
                    </div>
                    <div className="font-mono text-[11px] text-emerald-400 flex items-center justify-end gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
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
                    className="p-1.5 rounded-lg border border-white/10 bg-black/40 text-accent hover:bg-accent/20 transition-colors cursor-pointer"
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
                    className="rounded p-1 text-gray-600 hover:bg-rose-500/10 hover:text-rose-400 transition-all cursor-pointer"
                    title="Remove from Watchlist"
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
