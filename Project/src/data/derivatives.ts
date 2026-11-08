import type { DerivativeContract, DerivativeKind, Exchange } from '@/types';

interface ContractSeed {
  exchange: Exchange;
  underlying: string;
  expiry: string;
  strike?: number;
  kind: DerivativeKind;
  price: number;
  changePct: number;
}

const CONTRACT_SEEDS: ContractSeed[] = [
  { exchange: 'NSE', underlying: 'NIFTY', expiry: '26 NOV 2026', strike: 25000, kind: 'CE', price: 286.4, changePct: 8.24 },
  { exchange: 'NSE', underlying: 'NIFTY', expiry: '26 NOV 2026', strike: 25000, kind: 'PE', price: 142.8, changePct: -4.18 },
  { exchange: 'NSE', underlying: 'NIFTY', expiry: '09 DEC 2026', strike: 25000, kind: 'CE', price: 402.6, changePct: 5.67 },
  { exchange: 'NSE', underlying: 'NIFTY', expiry: '09 DEC 2026', strike: 25000, kind: 'PE', price: 254.2, changePct: -2.05 },
  { exchange: 'NSE', underlying: 'NIFTY', expiry: '17 DEC 2026', strike: 25000, kind: 'CE', price: 558.1, changePct: 3.85 },
  { exchange: 'NSE', underlying: 'NIFTY', expiry: '17 DEC 2026', strike: 25000, kind: 'PE', price: 388.7, changePct: -1.34 },
  { exchange: 'NSE', underlying: 'FINNIFTY', expiry: '25 NOV 2026', strike: 23000, kind: 'CE', price: 218.55, changePct: 6.02 },
  { exchange: 'NSE', underlying: 'FINNIFTY', expiry: '25 NOV 2026', strike: 23000, kind: 'PE', price: 176.2, changePct: -3.26 },
  { exchange: 'NSE', underlying: 'FINNIFTY', expiry: '25 DEC 2026', strike: 23000, kind: 'CE', price: 470.8, changePct: 2.78 },
  { exchange: 'NSE', underlying: 'FINNIFTY', expiry: '25 DEC 2026', strike: 23000, kind: 'PE', price: 394.6, changePct: -1.92 },
  { exchange: 'NSE', underlying: 'NIFTY', expiry: '30 NOV 2026', kind: 'FUT', price: 24382.6, changePct: 0.74 },
  { exchange: 'NSE', underlying: 'BANKNIFTY', expiry: '30 NOV 2026', kind: 'FUT', price: 52270.4, changePct: 0.68 },
  { exchange: 'BSE', underlying: 'SENSEX', expiry: '27 NOV 2026', strike: 80500, kind: 'CE', price: 312.4, changePct: 4.21 },
  { exchange: 'BSE', underlying: 'SENSEX', expiry: '27 NOV 2026', strike: 80500, kind: 'PE', price: 280.9, changePct: -2.16 },
  { exchange: 'BSE', underlying: 'SENSEX', expiry: '27 NOV 2026', kind: 'FUT', price: 80480.2, changePct: 0.52 },
  { exchange: 'BSE', underlying: 'BANKEX', expiry: '27 NOV 2026', kind: 'FUT', price: 58420.1, changePct: 0.38 },
  { exchange: 'MCX', underlying: 'GOLD', expiry: '30 NOV 2026', strike: 74500, kind: 'CE', price: 624.0, changePct: 9.1 },
  { exchange: 'MCX', underlying: 'GOLD', expiry: '30 NOV 2026', strike: 74500, kind: 'PE', price: 516.5, changePct: -5.4 },
  { exchange: 'MCX', underlying: 'GOLD', expiry: '30 NOV 2026', kind: 'FUT', price: 74388.0, changePct: 1.16 },
  { exchange: 'MCX', underlying: 'SILVER', expiry: '30 NOV 2026', strike: 92500, kind: 'CE', price: 840.5, changePct: 7.48 },
  { exchange: 'MCX', underlying: 'SILVER', expiry: '30 NOV 2026', strike: 92500, kind: 'PE', price: 702.8, changePct: -3.72 },
  { exchange: 'MCX', underlying: 'SILVER', expiry: '30 NOV 2026', kind: 'FUT', price: 92340.0, changePct: 1.68 },
];

function contractSymbol(seed: ContractSeed): string {
  const strike = seed.strike ? ` ${seed.strike}` : '';
  return `${seed.underlying} ${seed.expiry.split(' ').join('')}${strike} ${seed.kind}`;
}

export const DERIVATIVE_CONTRACTS: DerivativeContract[] = CONTRACT_SEEDS.map((seed) => {
  const changeAbs = seed.price * (seed.changePct / 100);
  const prevClose = seed.price - changeAbs;
  return {
    symbol: contractSymbol(seed),
    name: `${seed.underlying} ${seed.expiry}${seed.strike ? ` ${seed.strike}` : ''} ${seed.kind}`,
    exchange: seed.exchange,
    price: seed.price,
    changePct: seed.changePct,
    changeAbs,
    trend: seed.changePct >= 0 ? 'up' : 'down',
    high: seed.price * 1.025,
    low: seed.price * 0.975,
    open: prevClose,
    prevClose,
    volume: seed.kind === 'FUT' ? '18,420 lots' : '9,840 lots',
    kind: seed.kind,
    underlying: seed.underlying,
    expiry: seed.expiry,
    strike: seed.strike,
  };
});

export function getDerivative(symbol: string): DerivativeContract | undefined {
  return DERIVATIVE_CONTRACTS.find((contract) => contract.symbol === symbol);
}
