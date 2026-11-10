export type Trend = 'up' | 'down';

export type Exchange = 'NSE' | 'BSE' | 'MCX';

export interface MarketInstrument {
  symbol: string;
  name: string;
  exchange: Exchange;
  price: number;
  changePct: number;
  changeAbs: number;
  trend: Trend;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  volume: string;
}

export type DerivativeKind = 'FUT' | 'CE' | 'PE' | 'INDEX';

export interface DerivativeContract extends MarketInstrument {
  kind: DerivativeKind;
  underlying: string;
  expiry: string;
  strike?: number;
  token?: string;
  instrumentKey?: string;
  lotsize?: number;
  exch_seg?: string;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type Timeframe = '1M' | '3M' | '5M' | '15M' | '30M' | '1H' | '1D' | '1W';

// Indian equity markets (NSE/BSE) support 1X–10X leverage.
export type EquityLeverage = '1X' | '2X' | '3X' | '5X' | '7X' | '10X';
// Commodity markets (MCX) support 10X–500X leverage.
export type CommodityLeverage =
  | '10X'
  | '25X'
  | '50X'
  | '100X'
  | '200X'
  | '300X'
  | '400X'
  | '500X';

export type Leverage = EquityLeverage | CommodityLeverage;

export type OrderSide = 'BUY' | 'SELL';

export type OrderType = 'MARKET' | 'LIMIT';

export interface Position {
  id: string;
  symbol: string;
  name: string;
  side: OrderSide;
  qty: number;
  entryPrice: number;
  leverage: Leverage | `${number}x`;
  margin: number;
  currentPrice: number;
  scale_factor?: number;
  lots?: number;
  lotsize?: string | number;
  notional?: number;
  maxLoss?: number;
  status?: 'OPEN' | 'CLOSED';
  openedAt?: string;
}

export interface TradeHistory {
  id: string;
  positionId: string;
  symbol: string;
  name: string;
  side: OrderSide;
  qty: number;
  buyPrice: number;
  sellPrice: number;
  pnl: number;
  margin: number;
  closedAt: string;
  reason: 'EXIT' | 'EXIT_ALL';
}

// 🌟 Updated WatchlistItem to support token, lotsize, exchange, etc.
export interface WatchlistItem {
  symbol: string;
  name?: string;
  exchange?: Exchange | string;
  exch_seg?: string;
  token?: string;
  instrumentKey?: string;
  lotsize?: number;
  expiry?: string;
  kind?: DerivativeKind | string;
  addedAt?: number;
  price?: number;
}

export interface WalletTx {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAW';
  amount: number;
  status: 'PENDING' | 'COMPLETED' | 'REJECTED';
  date: string;
  method: string;
}

export interface SessionState {
  walletBalance: number;
  watchlist: (WatchlistItem | string)[];
  positions: Position[];
  transactions: WalletTx[];
  activeTab: DashboardTab;
}

export type DashboardTab = 'markets' | 'wallet' | 'positions';

export const EXCHANGES: Exchange[] = ['NSE', 'BSE', 'MCX'];
export const TIMEFRAMES: Timeframe[] = ['1M', '3M', '5M', '15M', '30M', '1H', '1D', '1W'];

export const EQUITY_LEVERAGES: EquityLeverage[] = ['1X', '2X', '3X', '5X', '7X', '10X'];
export const COMMODITY_LEVERAGES: CommodityLeverage[] = [
  '10X',
  '25X',
  '50X',
  '100X',
  '200X',
  '300X',
  '400X',
  '500X',
];

export const LEVERAGE_MULT: Record<Leverage, number> = {
  '1X': 1,
  '2X': 2,
  '3X': 3,
  '5X': 5,
  '7X': 7,
  '10X': 10,
  '25X': 25,
  '50X': 50,
  '100X': 100,
  '200X': 200,
  '300X': 300,
  '400X': 400,
  '500X': 500,
};

export function leveragesForExchange(ex: Exchange): Leverage[] {
  return ex === 'MCX' ? COMMODITY_LEVERAGES : EQUITY_LEVERAGES;
}

export const APK_URL =
  'https://drive.google.com/uc?export=download&id=1HwT-fhdOqWFS05f7JUoD1aP-x9ogjii8';
