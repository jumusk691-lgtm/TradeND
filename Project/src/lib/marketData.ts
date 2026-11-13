export const RENDER_WS_URL = 'wss://myt-backend-1.onrender.com/ws';

export interface MarketTick {
  timestamp: number;
  price: number;
}

export function normalizeMarketKey(value: unknown): string {
  return String(value ?? '').trim().replace(/:/g, '|').toUpperCase();
}

export function getMarketPrice(value: unknown): number {
  const record = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : null;
  const candidate = record
    ? record.ltp ?? record.price ?? record.last_price ?? record.lastPrice ?? record.cp ?? record.close
    : value;
  const price = Number(candidate);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

export function getMarketTimestamp(
  value: Record<string, unknown>,
  fallback = Date.now()
): number {
  const raw = value.timestamp ?? value.ts ?? value.exchange_timestamp ?? value.last_trade_time ?? value.time;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw < 1_000_000_000_000 ? raw * 1000 : raw;
  }

  if (typeof raw === 'string' && raw.trim()) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
      return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }

  return fallback;
}

export function matchesMarketInstrument(
  key: unknown,
  aliases: string[]
): boolean {
  const normalizedKey = normalizeMarketKey(key);
  if (!normalizedKey) return false;

  return aliases.some((alias) => {
    const normalizedAlias = normalizeMarketKey(alias);
    return normalizedAlias !== '' && normalizedAlias === normalizedKey;
  });
}
