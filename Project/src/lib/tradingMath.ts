import type { OrderSide } from '../types';

export interface PnlPosition {
  symbol: string;
  side: OrderSide;
  qty: number;
  entryPrice: number;
  margin: number;
  contractMultiplier?: number;
}

export function roundCurrency(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  const direction = amount < 0 ? -1 : 1;
  return Math.round((amount + direction * Number.EPSILON) * 100) / 100;
}

export function getGoldContractGrams(symbol: string): number {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalized.includes('GOLDPETAL')) return 1;
  if (normalized.includes('GOLDGUINEA')) return 8;
  if (normalized.includes('GOLDTEN')) return 10;
  if (normalized.includes('GOLDM')) return 100;
  if (normalized.includes('GOLD')) return 1000;
  return 0;
}

function getGoldQuoteGrams(symbol: string): number {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalized.includes('GOLDPETAL')) return 1;
  if (normalized.includes('GOLDGUINEA')) return 8;
  return 10;
}

export function getPricePerGram(symbol: string, price: number): number {
  return getGoldContractGrams(symbol) > 0
    ? price / getGoldQuoteGrams(symbol)
    : price;
}

export function getContractMultiplier(symbol: string): number {
  const gramsPerLot = getGoldContractGrams(symbol);
  return gramsPerLot > 0 ? gramsPerLot / getGoldQuoteGrams(symbol) : 1;
}

export function calculateNotional(
  symbol: string,
  price: number,
  quantity: number
): number {
  const gramsPerLot = getGoldContractGrams(symbol);
  const notional = gramsPerLot > 0
    ? quantity * gramsPerLot * getPricePerGram(symbol, price)
    : price * quantity;
  return roundCurrency(notional);
}

export function calculateMargin(notional: number, leverage: number): number {
  if (!Number.isFinite(notional) || !Number.isFinite(leverage) || leverage <= 0) {
    return 0;
  }
  return roundCurrency(notional / leverage);
}

export function calculateGrossPnl(
  position: PnlPosition,
  exitPrice: number
): number {
  const direction = position.side === 'BUY' ? 1 : -1;
  const multiplier = position.contractMultiplier ?? getContractMultiplier(position.symbol);
  return roundCurrency(
    (exitPrice - position.entryPrice) * position.qty * direction * multiplier
  );
}

export function calculateCappedPnl(
  position: PnlPosition,
  exitPrice: number
): number {
  const grossPnl = calculateGrossPnl(position, exitPrice);
  const margin = Math.max(0, roundCurrency(position.margin));
  return Math.max(-margin, grossPnl);
}

export function calculateReturnOnMargin(pnl: number, margin: number): number {
  if (!Number.isFinite(margin) || margin <= 0) return 0;
  return (pnl / margin) * 100;
}
