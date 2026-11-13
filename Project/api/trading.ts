import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import {
  calculateCappedPnl,
  calculateMargin,
  calculateNotional,
  calculateOptionSellMargin,
  getGoldContractGrams,
  getContractMultiplier,
  roundCurrency,
} from '../src/lib/tradingMath';
import { getMarketStatus, MARKET_CLOSED_MESSAGE } from '../src/lib/marketHours';

type AccountRecord = Record<string, any>;
type MutationResult =
  | { ok: true; account: AccountRecord; response: unknown }
  | { ok: false; error: string };

const DATABASE_URL = 'https://trade-f600a-default-rtdb.firebaseio.com';
const STARTING_BALANCE = 50000;
const MAX_QUANTITY = 100_000_000;

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

function getAdminApp() {
  const existing = getApps().find((app) => app.name === '[DEFAULT]');
  if (existing) return existing;

  const serializedCredentials = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serializedCredentials) {
    try {
      return initializeApp({
        credential: cert(JSON.parse(serializedCredentials)),
        databaseURL: DATABASE_URL,
      });
    } catch {
      throw new ApiError(503, 'Firebase server credentials are invalid.');
    }
  }

  const privateKey = process.env.PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!privateKey) {
    throw new ApiError(503, 'Firebase server credentials are not configured.');
  }

  return initializeApp({
    credential: cert({
      projectId: 'trade-f600a',
      clientEmail: 'firebase-adminsdk-fbsvc@trade-f600a.iam.gserviceaccount.com',
      privateKey,
    }),
    databaseURL: DATABASE_URL,
  });
}

function requireObject(value: unknown): AccountRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as AccountRecord)
    : {};
}

function parseBody(request: VercelRequest): AccountRecord {
  if (request.body && typeof request.body === 'object') {
    return request.body as AccountRecord;
  }
  if (typeof request.body === 'string') {
    try {
      return requireObject(JSON.parse(request.body));
    } catch {
      throw new ApiError(400, 'Request body must be valid JSON.');
    }
  }
  return {};
}

async function requireUid(request: VercelRequest): Promise<string> {
  const authorization = request.headers.authorization;
  const match = typeof authorization === 'string'
    ? authorization.match(/^Bearer\s+(.+)$/i)
    : null;
  if (!match) throw new ApiError(401, 'Please sign in again to trade.');

  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(match[1], true);
    return decoded.uid;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, 'Your session is invalid or expired. Please sign in again.');
  }
}

function validateMoney(value: unknown, label: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 1_000_000_000) {
    throw new ApiError(400, `${label} must be a valid positive number.`);
  }
  return numeric;
}

function leverageChoices(exchange: string): number[] {
  return exchange.toUpperCase().includes('MCX')
    ? [10, 25, 50, 100, 200, 300, 400, 500]
    : [1, 2, 3, 5, 7, 10];
}

function requireOpenMarket(exchange: string) {
  const status = getMarketStatus(exchange, new Date());
  if (!status.isOpen) throw new ApiError(409, MARKET_CLOSED_MESSAGE);
}

function cloneAccount(value: unknown): AccountRecord {
  const account = requireObject(value);
  return JSON.parse(JSON.stringify(account)) as AccountRecord;
}

async function transactAccount<T>(
  uid: string,
  mutate: (account: AccountRecord) => MutationResult
): Promise<T> {
  const transactionState: { mutation?: MutationResult } = {};
  const result = await getDatabase(getAdminApp())
    .ref(`users_details/${uid}`)
    .transaction((current) => {
      const mutation = mutate(cloneAccount(current));
      transactionState.mutation = mutation;
      return mutation.ok ? mutation.account : undefined;
    }, undefined, false);

  const mutation = transactionState.mutation;
  if (!result.committed || !mutation || mutation.ok === false) {
    const message = mutation?.ok === false
      ? mutation.error
      : 'The account changed before the trade completed. Please retry.';
    throw new ApiError(409, message);
  }
  return mutation.response as T;
}

function openPosition(body: AccountRecord, uid: string) {
  const symbol = typeof body.symbol === 'string' ? body.symbol.trim().slice(0, 80) : '';
  if (!symbol) throw new ApiError(400, 'Choose a valid instrument.');

  const side = body.side === 'BUY' || body.side === 'SELL' ? body.side : null;
  if (!side) throw new ApiError(400, 'Order side must be BUY or SELL.');

  const exchange = typeof body.exchange === 'string'
    ? body.exchange.trim().slice(0, 24)
    : 'NSE';
  requireOpenMarket(exchange);
  const quantity = Number(body.qty);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    throw new ApiError(400, 'Quantity must be a positive whole number.');
  }

  const entryPrice = validateMoney(body.entryPrice, 'Order price');
  const leverage = Number(String(body.leverage ?? '').replace(/[xX]$/, ''));
  if (!leverageChoices(exchange).includes(leverage)) {
    throw new ApiError(400, 'The selected leverage is not available for this exchange.');
  }

  const requestedKind = String(body.kind ?? '').trim().toUpperCase();
  const optionKind = requestedKind === 'CE' || requestedKind === 'PE'
    ? requestedKind
    : null;
  const lots = Number(body.lots);
  const lotSize = Number(body.lotSize);
  if (optionKind) {
    if (!Number.isSafeInteger(lots) || lots < 1 || lots > MAX_QUANTITY) {
      throw new ApiError(400, 'Option lots must be a positive whole number.');
    }
    if (!Number.isSafeInteger(lotSize) || lotSize < 1 || lotSize > MAX_QUANTITY) {
      throw new ApiError(400, 'Option lot size must be a positive whole number.');
    }
    const expectedQuantity = getGoldContractGrams(symbol) > 0
      ? lots
      : lots * lotSize;
    if (!Number.isSafeInteger(expectedQuantity) || expectedQuantity !== quantity) {
      throw new ApiError(400, 'Option quantity must match its lot count and lot size.');
    }
  }

  const contractMultiplier = getContractMultiplier(symbol);
  const notional = calculateNotional(symbol, entryPrice, quantity);
  const isOptionSell = side === 'SELL' && optionKind !== null;
  const margin = isOptionSell
    ? calculateOptionSellMargin(lots)
    : calculateMargin(notional, leverage);
  if (!Number.isFinite(margin) || margin <= 0) {
    throw new ApiError(400, 'The calculated margin is invalid.');
  }

  const id = crypto.randomUUID();
  const openedAt = Date.now();
  const position = {
    id,
    symbol,
    name: typeof body.name === 'string' ? body.name.trim().slice(0, 120) : symbol,
    side,
    qty: quantity,
    entryPrice,
    currentPrice: validateMoney(body.currentPrice ?? entryPrice, 'Current price'),
    leverage: `${leverage}X`,
    margin,
    notional,
    contractMultiplier,
    exchange,
    product: body.product === 'DELIVERY' ? 'DELIVERY' : 'INTRADAY',
    orderType: body.orderType === 'LIMIT' ? 'LIMIT' : 'MARKET',
    ...(optionKind ? { kind: optionKind, lots, lotSize } : {}),
    openedAt,
    status: 'OPEN',
  };

  return transactAccount<{ position: typeof position; balance: number }>(uid, (account) => {
    const currentMarketStatus = getMarketStatus(exchange, new Date());
    if (!currentMarketStatus.isOpen) {
      return { ok: false, error: MARKET_CLOSED_MESSAGE };
    }

    const funds = requireObject(account.funds);
    const storedBalance = funds.balance === undefined || funds.balance === null
      ? STARTING_BALANCE
      : Number(funds.balance);
    if (!Number.isFinite(storedBalance) || storedBalance < 0) {
      return { ok: false, error: 'The wallet balance is invalid. Please contact support.' };
    }

    const openPositions = requireObject(account.open_positions);
    const balance = roundCurrency(storedBalance);
    if (margin > balance) {
      return {
        ok: false,
        error: `Insufficient available balance. Required margin is ₹${margin.toFixed(2)}.`,
      };
    }

    const nextAccount = cloneAccount(account);
    nextAccount.funds = { ...funds, balance: roundCurrency(balance - margin) };
    nextAccount.open_positions = { ...openPositions, [id]: position };
    return {
      ok: true,
      account: nextAccount,
      response: { position, balance: roundCurrency(balance - margin) },
    };
  });
}

function settlePosition(
  positionId: string,
  position: AccountRecord,
  exitPrice: number
) {
  const symbol = String(position.symbol ?? '');
  const side = position.side === 'BUY' || position.side === 'SELL' ? position.side : null;
  const quantity = Number(position.qty);
  const entryPrice = Number(position.entryPrice);
  const margin = Number(position.margin);
  if (!side || !Number.isSafeInteger(quantity) || quantity <= 0 ||
      !Number.isFinite(entryPrice) || entryPrice <= 0 ||
      !Number.isFinite(margin) || margin <= 0) {
    throw new ApiError(409, 'This position has invalid trade data and cannot be settled.');
  }

  const contractMultiplier = getContractMultiplier(symbol);
  const realizedPnl = calculateCappedPnl({
    symbol,
    side,
    qty: quantity,
    entryPrice,
    margin,
    contractMultiplier,
  }, exitPrice);
  const closedAt = Date.now();
  const buyPrice = side === 'BUY' ? entryPrice : exitPrice;
  const sellPrice = side === 'BUY' ? exitPrice : entryPrice;

  return {
    history: {
      id: positionId,
      symbol,
      name: typeof position.name === 'string' ? position.name : symbol,
      side,
      qty: quantity,
      buyPrice,
      sellPrice,
      entryPrice,
      exitPrice,
      margin: roundCurrency(margin),
      realizedPnl,
      closedAt,
      openedAt: Number(position.openedAt ?? position.timestamp ?? closedAt),
      leverage: String(position.leverage ?? ''),
      contractMultiplier,
    },
    releasedBalance: roundCurrency(margin + realizedPnl),
  };
}

function closeOne(body: AccountRecord, uid: string) {
  const positionId = typeof body.id === 'string' ? body.id : '';
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(positionId)) {
    throw new ApiError(400, 'Choose a valid position to exit.');
  }
  const exitPrice = validateMoney(body.exitPrice, 'Exit price');

  return transactAccount<{ history: Record<string, unknown>; balance: number }>(uid, (account) => {
    const openPositions = requireObject(account.open_positions);
    const position = requireObject(openPositions[positionId]);
    if (!position.id) return { ok: false, error: 'This position is no longer open.' };
    const marketStatus = getMarketStatus(String(position.exchange ?? 'NSE'), new Date());
    if (!marketStatus.isOpen) return { ok: false, error: MARKET_CLOSED_MESSAGE };
    const funds = requireObject(account.funds);
    const balance = Number(funds.balance ?? 0);
    if (!Number.isFinite(balance) || balance < 0) {
      return { ok: false, error: 'The wallet balance is invalid. Please contact support.' };
    }

    const settlement = settlePosition(positionId, position, exitPrice);
    const history = requireObject(account.trade_history);
    const nextOpenPositions = { ...openPositions };
    delete nextOpenPositions[positionId];
    const nextBalance = roundCurrency(balance + settlement.releasedBalance);
    const nextAccount = cloneAccount(account);
    nextAccount.funds = { ...funds, balance: nextBalance };
    nextAccount.open_positions = nextOpenPositions;
    nextAccount.trade_history = { ...history, [positionId]: settlement.history };
    return {
      ok: true,
      account: nextAccount,
      response: { history: settlement.history, balance: nextBalance },
    };
  });
}

function closeAll(body: AccountRecord, uid: string) {
  const closePrices = requireObject(body.closePrices);
  return transactAccount<{ closed: number; balance: number }>(uid, (account) => {
    const openPositions = requireObject(account.open_positions);
    const entries = Object.entries(openPositions);
    if (entries.length === 0) return { ok: false, error: 'There are no open positions to exit.' };

    const funds = requireObject(account.funds);
    const balance = Number(funds.balance ?? 0);
    if (!Number.isFinite(balance) || balance < 0) {
      return { ok: false, error: 'The wallet balance is invalid. Please contact support.' };
    }

    const history = requireObject(account.trade_history);
    const nextOpenPositions = { ...openPositions };
    const nextHistory = { ...history };
    let nextBalance = roundCurrency(balance);
    let closed = 0;

    for (const [positionId, rawPosition] of entries) {
      const position = requireObject(rawPosition);
      const marketStatus = getMarketStatus(String(position.exchange ?? 'NSE'), new Date());
      if (!marketStatus.isOpen) return { ok: false, error: MARKET_CLOSED_MESSAGE };
      const requestedPrice = Number(closePrices[position.symbol]);
      const fallbackPrice = Number(position.currentPrice ?? position.entryPrice);
      const exitPrice = Number.isFinite(requestedPrice) && requestedPrice > 0
        ? requestedPrice
        : fallbackPrice;
      if (!Number.isFinite(exitPrice) || exitPrice <= 0) {
        return { ok: false, error: `A valid exit price is unavailable for ${position.symbol}.` };
      }

      const settlement = settlePosition(positionId, position, exitPrice);
      nextBalance = roundCurrency(nextBalance + settlement.releasedBalance);
      nextHistory[positionId] = settlement.history;
      delete nextOpenPositions[positionId];
      closed += 1;
    }

    const nextAccount = cloneAccount(account);
    nextAccount.funds = { ...funds, balance: nextBalance };
    nextAccount.open_positions = nextOpenPositions;
    nextAccount.trade_history = nextHistory;
    return {
      ok: true,
      account: nextAccount,
      response: { closed, balance: nextBalance },
    };
  });
}

export async function handleTradingRequest(
  request: VercelRequest,
  response: VercelResponse
) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const uid = await requireUid(request);
    const body = parseBody(request);
    const action = body.action;

    if (action === 'open') {
      const result = await openPosition(body, uid);
      return response.status(201).json(result);
    }
    if (action === 'close') {
      const result = await closeOne(body, uid);
      return response.status(200).json(result);
    }
    if (action === 'closeAll') {
      const result = await closeAll(body, uid);
      return response.status(200).json(result);
    }
    return response.status(400).json({ error: 'Unsupported trading action.' });
  } catch (error) {
    if (error instanceof ApiError) {
      return response.status(error.status).json({ error: error.message });
    }
    console.error('Trading API request failed:', error);
    return response.status(500).json({ error: 'Trading request could not be completed.' });
  }
}

export default handleTradingRequest;
