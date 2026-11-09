import type { DerivativeContract, DerivativeKind, Exchange } from '@/types';

// 👉 No demo contracts. All options & futures contracts are driven dynamically by Supabase DB & Render backend.
export const DERIVATIVE_CONTRACTS: DerivativeContract[] = [];

export function getDerivative(symbol: string): DerivativeContract | undefined {
  return DERIVATIVE_CONTRACTS.find((contract) => contract.symbol === symbol);
}
