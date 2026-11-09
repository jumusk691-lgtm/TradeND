import type { MarketInstrument } from '@/types';
import { getDerivative } from './derivatives';

// 👉 No demo instruments. All symbols are dynamically driven by Supabase DB & Render backend.
export const INSTRUMENTS: MarketInstrument[] = [];

export function getInstrument(symbol: string): MarketInstrument {
  const found = INSTRUMENTS.find((i) => i.symbol === symbol);
  if (found) return found;

  try {
    const deriv = getDerivative(symbol);
    if (deriv) return deriv;
  } catch (e) {
    // Ignore derivative lookup error
  }

  // Safe fallback for dynamic DB symbols not present in static arrays
  return {
    symbol: symbol || 'UNKNOWN',
    name: symbol || 'Unknown Instrument',
    exchange: 'NSE',
    price: 0.0,
    changePct: 0,
    changeAbs: 0,
    trend: 'up',
    high: 0.0,
    low: 0.0,
    open: 0.0,
    prevClose: 0.0,
    volume: '—',
  };
}
