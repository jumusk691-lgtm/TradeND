
import { Star, X, Inbox, BarChart2 } from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';

import { fmtNum } from '@/lib/format';
import { db } from '@/lib/firebase';
import { onValue, ref } from 'firebase/database';

const DEFAULT_WS_URL = 'wss://myt-backend-ghpx.onrender.com/ws';

interface WatchlistPanelProps {
  watchlist: any[];
  onSelect: (contract: any) => void;
  onRemove: (symbol: string) => void;
  onOpenChart?: (contract: any) => void;
  selected: string;
}

interface PriceState {
  live: Record<string, number>;
  previous: Record<string, number>;
}

const normalizeToken = (token: string) =>
  token.replace(/:/g, '|').trim();

const getPrice = (data: any): number => {
  const value =
    data?.ltp ??
    data?.price ??
    data?.last_price ??
    data?.cp ??
    data?.close ??
    data;

  const price = Number(value);

  return Number.isFinite(price) && price > 0 ? price : 0;
};

export function WatchlistPanel({
  watchlist = [],
  onSelect,
  onRemove,
  onOpenChart,
  selected,
}: WatchlistPanelProps) {

  const [priceState, setPriceState] = useState<PriceState>({
    live: {},
    previous: {},
  });

  const [wsUrl, setWsUrl] = useState(DEFAULT_WS_URL);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);

  // Read WebSocket URL from Firebase.
  useEffect(() => {
    const urlRef = ref(db, 'settings/ws_url');

    const unsubscribe = onValue(
      urlRef,
      snapshot => {
        const value = snapshot.val();

        if (
          typeof value === 'string' &&
          value.trim() &&
          value.startsWith('wss://')
        ) {
          setWsUrl(value.trim());
        }
      },
      error => {
        console.error('Firebase WS URL error:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Create stable watchlist subscription.
  const watchlistKey = useMemo(() => {
    return JSON.stringify(
      watchlist.map(item => ({
        token: String(
          item.token ||
          item.instrumentKey ||
          ''
        ).trim(),

        symbol: String(item.symbol || '').trim(),
      }))
    );
  }, [watchlist]);

  // Connect WebSocket and subscribe to watchlist.
  useEffect(() => {
    if (!wsUrl) return;

    let stopped = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let currentWs: WebSocket | null = null;

    let reconnectDelay = 3000;

    const items = JSON.parse(watchlistKey);

    const tokens = Array.from(
      new Set<string>([
        'NSE_INDEX|Nifty 50',
        'BSE_INDEX|SENSEX',
        ...items
          .map((item: any) => item.token)
          .filter((token: string) => Boolean(token)),
      ])
    );

    const connectWS = () => {
      if (stopped) return;

      try {
        const ws = new WebSocket(wsUrl);

        currentWs = ws;
        wsRef.current = ws;

        ws.onopen = () => {
          if (stopped) {
            ws.close();
            return;
          }

          console.log('MYT WebSocket Connected');

          setConnected(true);
          reconnectDelay = 3000;

          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                action: 'sub',
                guid: 'upstox_sub_request',
                instrumentKeys: tokens,
                tokens,
              })
            );
          }
        };

        ws.onmessage = event => {
          if (stopped) return;

          try {
            const data = JSON.parse(event.data);

            // Initial prices received from backend.
            if (
              data.type === 'initial_ltps' &&
              data.data &&
              typeof data.data === 'object'
            ) {
              const incoming: Record<string, number> = {};

              Object.entries(data.data).forEach(([key, value]) => {
                const price = getPrice(value);

                if (price > 0) {
                  incoming[key] = price;
                  incoming[normalizeToken(key)] = price;
                }
              });

              setPriceState(previous => {
                const live = { ...previous.live };
                const old = { ...previous.previous };

                Object.entries(incoming).forEach(([key, price]) => {
                  if (live[key] !== undefined) {
                    old[key] = live[key];
                  } else {
                    old[key] = price;
                  }

                  live[key] = price;
                });

                return {
                  live,
                  previous: old,
                };
              });

              return;
            }

            // Normal live price updates.
            const tokenKey = String(
              data.instrument_key ||
              data.instrumentKey ||
              data.token ||
              data.t ||
              data.symbol ||
              ''
            ).trim();

            const price = getPrice(data);

            if (!tokenKey || price <= 0) return;

            const alternateKey = normalizeToken(tokenKey);

            const keys = Array.from(
              new Set([
                tokenKey,
                alternateKey,
                ...(data.symbol ? [String(data.symbol)] : []),
              ])
            );

            setPriceState(previous => {
              const live = { ...previous.live };
              const old = { ...previous.previous };

              const oldPrice =
                live[tokenKey] ??
                live[alternateKey] ??
                live[data.symbol] ??
                price;

              keys.forEach(key => {
                old[key] = oldPrice;
                live[key] = price;
              });

              return {
                live,
                previous: old,
              };
            });

          } catch (error) {
            console.error('WebSocket message error:', error);
          }
        };

        ws.onerror = error => {
          console.error('MYT WebSocket error:', error);
        };

        ws.onclose = () => {
          if (currentWs === ws) {
            currentWs = null;
            wsRef.current = null;
          }

          setConnected(false);

          if (!stopped) {
            reconnectTimer = setTimeout(
              connectWS,
              reconnectDelay
            );

            reconnectDelay = Math.min(
              reconnectDelay * 2,
              15000
            );
          }
        };

      } catch (error) {
        console.error('WebSocket connection failed:', error);

        if (!stopped) {
          reconnectTimer = setTimeout(connectWS, reconnectDelay);
        }
      }
    };

    connectWS();

    return () => {
      stopped = true;

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }

      if (currentWs) {
        currentWs.onopen = null;
        currentWs.onmessage = null;
        currentWs.onerror = null;
        currentWs.onclose = null;

        currentWs.close(1000, 'Watchlist updated');

        currentWs = null;
      }

      if (wsRef.current) {
        wsRef.current = null;
      }

      setConnected(false);
    };

  }, [wsUrl, watchlistKey]);

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">

      {/* Header */}
      <div className="flex items-center justify-between mb-3">

        <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">

          <Star className="h-5 w-5 text-gold fill-gold" />

          Watchlist &amp; Live LTP Checker

          <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium text-gray-400">
            {watchlist.length}
          </span>

        </h3>

        <span className={`flex items-center gap-1.5 text-[10px] ${
          connected ? 'text-emerald-400' : 'text-rose-400'
        }`}>

          <span className={`h-2 w-2 rounded-full ${
            connected ? 'bg-emerald-400' : 'bg-rose-400'
          } animate-pulse`} />

          {connected ? 'CONNECTED' : 'CONNECTING'}

        </span>

      </div>

      {/* Empty Watchlist */}
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

        /* Watchlist Items */
        <div className="space-y-1.5 max-h-[350px] overflow-y-auto scrollbar-thin">

          {watchlist.map((item, index) => {

            const sym = String(item.symbol || '');

            const name = item.name || sym;

            const tokenKey = String(
              item.token ||
              item.instrumentKey ||
              ''
            );

            const altTokenKey = normalizeToken(tokenKey);

            const priceValue =
              priceState.live[tokenKey] ??
              priceState.live[altTokenKey] ??
              priceState.live[sym] ??
              item.price ??
              0;

            const price = Number(priceValue) || 0;

            const oldPrice =
              priceState.previous[tokenKey] ??
              priceState.previous[altTokenKey] ??
              priceState.previous[sym] ??
              price;

            const isGreen = price >= oldPrice;

            const isSelected = selected === sym;

            return (

              <div
                key={tokenKey || sym || index}
                onClick={() => onSelect(item)}
                className={`group flex items-center justify-between rounded-xl border p-3 transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-accent/40 bg-accent/20'
                    : 'border-white/10 bg-black/40 hover:border-white/20'
                }`}
              >

                {/* Instrument Details */}
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

                </div>

                {/* Price and Actions */}
                <div className="flex items-center gap-3">

                  <div className="text-right">

                    <div className={`font-mono text-sm font-bold ${
                      isGreen ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {fmtNum(price)}
                    </div>

                    <div className="font-mono text-[10px] text-gray-400 flex items-center justify-end gap-1">

                      <span className={`h-1.5 w-1.5 rounded-full ${
                        connected
                          ? 'bg-emerald-400'
                          : 'bg-gray-500'
                      } animate-pulse`} />

                      {connected ? 'Live LTP' : 'Waiting'}

                    </div>

                  </div>

                  {/* Open Chart */}
                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation();

                      onSelect(item);
                      onOpenChart?.(item);
                    }}
                    className="p-1.5 rounded-lg border border-white/10 bg-black/50 text-accent hover:bg-accent/20 transition-colors cursor-pointer"
                    title="Open Chart"
                  >
                    <BarChart2 className="h-4 w-4" />
                  </button>

                  {/* Remove */}
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
