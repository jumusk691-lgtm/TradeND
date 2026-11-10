import type { OrderSide, Position } from '@/types';

export function priceMultiplier(symbol: string, scaleFactor = 1): number {
  return symbol.toUpperCase().includes('GOLD') ? scaleFactor / 10 : 1;
}

export function calculateNotional(
  price: number,
  quantity: number,
  symbol: string,
  scaleFactor = 1,
): number {
  return Math.max(0, price) * Math.max(0, quantity) * priceMultiplier(symbol, scaleFactor);
}

export function calculateMargin(notional: number, leverage: number): number {
  return leverage > 0 ? Math.max(0, notional) / leverage : 0;
}

export function calculatePnl(
  side: OrderSide,
  entryPrice: number,
  currentPrice: number,
  quantity: number,
  symbol: string,
  scaleFactor = 1,
): number {
  const direction = side === 'BUY' ? 1 : -1;
  return (currentPrice - entryPrice) * quantity * direction * priceMultiplier(symbol, scaleFactor);
}

export function positionScaleFactor(position: Position): number {
  return Number(position.scale_factor) > 0 ? Number(position.scale_factor) : 1;
}

export function calculatePositionPnl(position: Position, currentPrice: number): number {
  const rawPnl = calculatePnl(
    position.side,
    position.entryPrice,
    currentPrice,
    position.qty,
    position.symbol,
    positionScaleFactor(position),
  );

  // A position cannot lose more than the margin reserved for it.
  return Math.max(-Math.max(0, position.margin), rawPnl);
}
