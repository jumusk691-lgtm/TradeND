import { useEffect, useMemo, useState } from 'react';
import {
  getMarketPrice,
  getMarketTimestamp,
  matchesMarketInstrument,
  normalizeMarketKey,
  RENDER_WS_URL,
  type MarketTick,
} from '@/lib/marketData';

interface InstrumentIdentity {
  symbol?: string;
  token?: string;
  instrumentKey?: string;
  exchange?: string;
  exch_seg?: string;
}

interface MarketFeedState {
  identity: string;
  connected: boolean;
  hasLivePrice: boolean;
  livePrice: number;
  ticks: MarketTick[];
}

const MAX_TICKS = 6000;
const RECONNECT_MAX_MS = 15000;
const INDEX_INSTRUMENT_KEYS: Record<string, string> = {
  'NIFTY 50': 'NSE_INDEX|Nifty 50',
  SENSEX: 'BSE_INDEX|SENSEX',
};

function emptyState(identity: string): MarketFeedState {
  return {
    identity,
    connected: false,
    hasLivePrice: false,
    livePrice: 0,
    ticks: [],
  };
}

export function useSelectedMarketFeed(
  instrument: InstrumentIdentity | null | undefined,
  fallbackPrice = 0
) {
  const symbol = String(instrument?.symbol ?? '').trim();
  const token = String(instrument?.token ?? '').trim();
  const exchange = String(instrument?.exch_seg ?? instrument?.exchange ?? 'NSE').trim();
  const instrumentKey = String(
    instrument?.instrumentKey ||
    (token ? `${exchange}|${token}` : '') ||
    INDEX_INSTRUMENT_KEYS[symbol.toUpperCase()] ||
    ''
  ).trim();
  const identity = useMemo(
    () => [symbol, exchange, instrumentKey, token].join('::'),
    [symbol, exchange, instrumentKey, token]
  );
  const aliases = useMemo(
    () => Array.from(new Set([symbol, instrumentKey, token].filter(Boolean))),
    [symbol, instrumentKey, token]
  );
  const [state, setState] = useState<MarketFeedState>(() => emptyState(''));

  useEffect(() => {
    if (!symbol) {
      setState(emptyState(identity));
      return;
    }

    setState((previous) => previous.identity === identity ? previous : emptyState(identity));

    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = 1000;

    const updateState = (update: (current: MarketFeedState) => MarketFeedState) => {
      setState((previous) => update(previous.identity === identity ? previous : emptyState(identity)));
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
    };

    const applyQuote = (key: unknown, value: unknown, fallbackKey?: unknown) => {
      const quoteKey = key ?? fallbackKey;
      const quote = value && typeof value === 'object'
        ? value as Record<string, unknown>
        : {};
      const effectiveKey = quoteKey ?? quote.instrument_key ?? quote.instrumentKey ?? quote.token ?? quote.symbol;
      if (!matchesMarketInstrument(effectiveKey, aliases)) return;

      const price = getMarketPrice(value);
      if (price <= 0) return;

      const tick: MarketTick = {
        timestamp: getMarketTimestamp(quote),
        price,
      };

      updateState((current) => ({
        ...current,
        hasLivePrice: true,
        livePrice: price,
        ticks: [...current.ticks, tick].slice(-MAX_TICKS),
      }));
    };

    const handleMessage = (raw: unknown) => {
      let message: unknown;
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (!message || typeof message !== 'object') return;
      const record = message as Record<string, unknown>;
      const payload = record.data;

      if (record.type === 'initial_ltps' && payload && typeof payload === 'object' && !Array.isArray(payload)) {
        Object.entries(payload as Record<string, unknown>).forEach(([key, value]) => applyQuote(key, value));
        return;
      }

      const nestedRecord = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : null;
      const directKey = record.instrument_key ?? record.instrumentKey ?? record.token ?? record.t ?? record.symbol;
      const directPrice = getMarketPrice(record);

      if (directPrice > 0) {
        applyQuote(directKey, record);
        return;
      }

      if (nestedRecord) {
        const nestedKey = nestedRecord.instrument_key ?? nestedRecord.instrumentKey ?? nestedRecord.token ?? nestedRecord.t ?? nestedRecord.symbol;
        if (getMarketPrice(nestedRecord) > 0) {
          applyQuote(nestedKey ?? directKey, nestedRecord);
          return;
        }
        Object.entries(nestedRecord).forEach(([key, value]) => applyQuote(key, value));
      }
    };

    const connect = () => {
      if (disposed) return;

      try {
        const ws = new WebSocket(RENDER_WS_URL);
        socket = ws;

        ws.onopen = () => {
          if (disposed) {
            ws.close(1000, 'Market feed no longer needed');
            return;
          }

          reconnectDelay = 1000;
          updateState((current) => ({ ...current, connected: true }));
          const keys = Array.from(new Set([instrumentKey, symbol, token].filter(Boolean)));
          const tokens = Array.from(new Set([token, instrumentKey].filter(Boolean)));

          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              action: 'sub',
              guid: `tradend_${normalizeMarketKey(symbol).replace(/[^A-Z0-9]+/g, '_') || 'selected'}`,
              instrumentKeys: keys,
              tokens,
            }));
          }
        };

        ws.onmessage = (event) => handleMessage(event.data);
        ws.onerror = () => ws.close();
        ws.onclose = () => {
          if (socket === ws) socket = null;
          if (disposed) return;
          updateState((current) => ({ ...current, connected: false }));
          scheduleReconnect();
        };
      } catch {
        scheduleReconnect();
      }
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close(1000, 'Selected instrument changed');
        socket = null;
      }
    };
  }, [aliases, exchange, identity, instrumentKey, symbol, token]);

  const current = state.identity === identity ? state : emptyState(identity);
  return {
    livePrice: current.hasLivePrice ? current.livePrice : (Number(fallbackPrice) > 0 ? Number(fallbackPrice) : 0),
    hasLivePrice: current.hasLivePrice,
    connected: current.connected,
    ticks: current.ticks,
  };
}
