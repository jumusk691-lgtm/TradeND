
import { Star, X, Inbox, BarChart2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { fmtNum } from '@/lib/format';
import { db } from '@/lib/firebase';
import { onValue, ref } from 'firebase/database';

const DEFAULT_WS_URL = 'wss://myt-backend-ghpx.onrender.com/ws';

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
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [prevPrices, setPrevPrices] = useState<Record<string, number>>({});
  const [wsUrl, setWsUrl] = useState(DEFAULT_WS_URL);
  const wsRef = useRef<WebSocket | null>(null);

  // Read the same WebSocket URL configured in Firebase for the APK.
  useEffect(() => {
    const urlRef = ref(db, 'settings/ws_url');

    const unsubscribe = onValue(urlRef, snapshot => {
      const value = snapshot.val();
      if (typeof value === 'string' && value.trim()) {
        setWsUrl(value.trim());
      }
    });

    return () => unsubscribe();
  }, []);

  // Only subscribe to this user's personal watchlist tokens.
  const watchlistKey = JSON.stringify(
    watchlist.map(item => ({
      token: item.token || item.instrumentKey || '',
      symbol: item.symbol || '',
    }))
  );

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const items = JSON.parse(watchlistKey);
    const tokens = Array.from(
      new Set<string>([
        'NSE_INDEX|Nifty 50',
        'BSE_INDEX|SENSEX',
        ...items.map((item: any) => item.token).filter(Boolean),
      ])
    );

    const connectWS = () => {
      if (stopped || !wsUrl) return;

      let ws: WebSocket;

      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;
      } catch (error) {
        console.error('WebSocket connection error:', error);
        reconnectTimer = setTimeout(connectWS, 5000);
        return;
      }

      ws.onopen = () => {
        console.log('Connected to MYT Live WebSocket');

        if (tokens.length > 0 && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            action: 'sub',
            guid: 'upstox_sub_request',
            instrumentKeys: tokens,
            tokens,
          }));
        }
      };

      ws.onmessage = event => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'initial_ltps' && data.data) {
            const prices: Record<string, number> = {};

            Object.keys(data.data).forEach(key => {
              prices[key] = Number(data.data[key]) || 0;
            });

            setLivePrices(previous => ({ ...previous, ...prices }));
            return;
          }

          const tokenKey =
            data.instrument_key ||
            data.instrumentKey ||
            data.token ||
            data.t ||
            data.symbol ||
            '';

          const priceValue =
            data.ltp ??
            data.price ??
            data.last_price ??
            data.cp ??
            data.close;

          if (!tokenKey || priceValue == null) return;

          const price = Number(priceValue);
          if (!Number.isFinite(price) || price <= 0) return;

          const alternateKey = tokenKey.replace(':', '|');

          setLivePrices(previous => {
            const oldPrice =
              previous[tokenKey] ??
              previous[alternateKey] ??
              price;

            setPrevPrices(old => ({
              ...old,
              [tokenKey]: oldPrice,
              [alternateKey]: oldPrice,
              ...(data.symbol ? { [data.symbol]: oldPrice } : {}),
            }));

            return {
              ...previous,
              [tokenKey]: price,
              [alternateKey]: price,
              ...(data.symbol ? { [data.symbol]: price } : {}),
            };
          });
        } catch (error) {
          console.error('WebSocket parsing error:', error);
        }
      };

      ws.onerror = error => {
        console.error('MYT WebSocket error:', error);
      };

      ws.onclose = () => {
        if (!stopped) {
          reconnectTimer = setTimeout(connectWS, 3000);
        }
      };
    };

    connectWS();

    return () => {
      stopped = true;

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }

      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close(1000, 'Watchlist updated or component closed');
        wsRef.current = null;
      }
    };
  }, [wsUrl, watchlistKey]);

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
          <Star className="h-5 w-5 text-gold fill-gold" />
          Watchlist &amp; Live LTP Checker
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium text-gray-400">
            {watchlist.length}
          </span>
        </h3>
      </div>

      {watchlist.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
          <Inbox className="h-7 w-7 text-gray-700 mb-2" />
          <p className="text-sm text-gray-500">
            Your watchlist is empty.
          </p>
          <p className="text-xs text-gray-600 mt-1">
            Tap the Star icon in the contract browser to add instruments here.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[350px] overflow-y-auto scrollbar-thin">
          {watchlist.map(item => {
            const sym = item.symbol || '';
            const name = item.name || sym;
            const exchange = item.exchange || item.exch_seg || 'NSE';
            const tokenKey = item.token || item.instrumentKey || '';
            const altTokenKey = tokenKey.replace(':', '|');

            const priceValue =
              livePrices[tokenKey] ??
              livePrices[altTokenKey] ??
              livePrices[sym] ??
              item.price ??
              0;

            const price = Number(priceValue) || 0;

            const oldPrice =
              prevPrices[tokenKey] ??
              prevPrices[altTokenKey] ??
              prevPrices[sym] ??
              price;

            const isGreen = price >= oldPrice;
            const isSelected = selected === sym;

            return (
              <div
                key={tokenKey || sym}
                onClick={() => onSelect(sym)}
                className={`group flex items-center justify-between rounded-xl border p-3 transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-accent/40 bg-accent/20'
                    : 'border-white/10 bg-black/40 hover:border-white/20'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-bold text-white tracking-wide truncate">
                      {name}
                    </span>

                    {item.kind && (
                      <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[10px] font-extrabold text-gold">
                        {item.kind}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-300">
                    <span className="text-gold font-semibold">
                      {exchange}
                    </span>

                    {item.expiry && (
                      <>
                        <span>·</span>
                        <span>
                          Exp: <strong className="text-white">{item.expiry}</strong>
                        </span>
                      </>
                    )}

                    {item.lotsize && (
                      <>
                        <span>·</span>
                        <span>
                          Lot: <strong className="text-white">{item.lotsize}</strong>
                        </span>
                      </>
                    )}

                    {tokenKey && (
                      <span className="text-[10px] text-gray-500 font-mono">
                        (Token: {tokenKey})
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className={`font-mono text-sm font-bold ${
                      isGreen ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {fmtNum(price)}
                    </div>

                    <div className="font-mono text-[10px] text-gray-400 flex items-center justify-end gap-1">
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        isGreen ? 'bg-emerald-400' : 'bg-rose-400'
                      } animate-pulse`} />
                      Live LTP
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation();
                      onSelect(sym);
                      onOpenChart?.(item);
                    }}
                    className="p-1.5 rounded-lg border border-white/10 bg-black/50 text-accent hover:bg-accent/20 transition-colors cursor-pointer"
                    title="Open Chart"
                  >
                    <BarChart2 className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation();
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
