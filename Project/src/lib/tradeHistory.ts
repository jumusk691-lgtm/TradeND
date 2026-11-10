import type { OrderSide, TradeHistoryEntry } from '@/types';

type FirebaseRecord = Record<string, unknown>;

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function safeTimestamp(value: unknown): number {
  const numeric = finiteNumber(value);
  if (numeric !== null && numeric > 0) return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return 0;
}

export function normalizeTradeHistory(value: unknown): TradeHistoryEntry[] {
  if (!value || typeof value !== 'object') return [];

  return Object.entries(value as FirebaseRecord)
    .flatMap(([key, rawRecord]) => {
      if (!rawRecord || typeof rawRecord !== 'object' || Array.isArray(rawRecord)) return [];

      const record = rawRecord as FirebaseRecord;
      const symbol = safeText(record.symbol, 'Unknown');
      const sideValue = safeText(record.side, '').toUpperCase();
      const side: OrderSide = sideValue === 'SELL' ? 'SELL' : 'BUY';
      const entryPrice = finiteNumber(record.entryPrice ?? record.buyPrice) ?? 0;
      const exitPrice = finiteNumber(record.exitPrice ?? record.sellPrice) ?? 0;
      const closedAt = safeTimestamp(record.closedAt ?? record.closed_at ?? record.timestamp);
      const openedAt = safeTimestamp(record.openedAt ?? record.opened_at) || closedAt;
      const contractMultiplier = finiteNumber(record.contractMultiplier);
      const buyPrice = finiteNumber(record.buyPrice) ?? (side === 'BUY' ? entryPrice : exitPrice);
      const sellPrice = finiteNumber(record.sellPrice) ?? (side === 'BUY' ? exitPrice : entryPrice);

      return [{
        id: safeText(record.id, key),
        symbol,
        name: safeText(record.name, symbol),
        side,
        qty: finiteNumber(record.qty ?? record.quantity) ?? 0,
        buyPrice,
        sellPrice,
        entryPrice,
        exitPrice,
        margin: finiteNumber(record.margin) ?? 0,
        realizedPnl: finiteNumber(record.realizedPnl ?? record.pnl) ?? 0,
        closedAt,
        openedAt,
        leverage: safeText(record.leverage, ''),
        ...(contractMultiplier !== null && contractMultiplier > 0 ? { contractMultiplier } : {}),
      } satisfies TradeHistoryEntry];
    })
    .sort((left, right) => right.closedAt - left.closedAt);
}
