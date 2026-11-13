export const MARKET_CLOSED_MESSAGE =
  'Market Closed - Orders can only be placed during market hours.';

export interface MarketStatus {
  isOpen: boolean;
  message: string;
  sessionLabel: string;
}

const INDIA_TIME_ZONE = 'Asia/Kolkata';
const NEW_YORK_TIME_ZONE = 'America/New_York';

function getIndiaMarketClock(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: INDIA_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    weekday: values.weekday,
    minutes: Number(values.hour) * 60 + Number(values.minute),
  };
}

function isUsDaylightSavingTime(now: Date): boolean {
  const timeZoneName = new Intl.DateTimeFormat('en-US', {
    timeZone: NEW_YORK_TIME_ZONE,
    timeZoneName: 'short',
  }).formatToParts(now).find((part) => part.type === 'timeZoneName')?.value;
  return timeZoneName === 'EDT';
}

export function getMarketStatus(exchange: string, now = new Date()): MarketStatus {
  const normalizedExchange = String(exchange || 'NSE').trim().toUpperCase();
  const { weekday, minutes } = getIndiaMarketClock(now);
  const isWeekday = weekday !== 'Sat' && weekday !== 'Sun';
  const isMcx = normalizedExchange.includes('MCX');
  const isEquity = /^(NSE|BSE|NFO|BFO)/.test(normalizedExchange.replace(/[^A-Z0-9]/g, ''));

  if (!isMcx && !isEquity) {
    return {
      isOpen: false,
      message: MARKET_CLOSED_MESSAGE,
      sessionLabel: 'No configured trading session for this exchange',
    };
  }

  const startMinutes = isMcx ? 9 * 60 : 9 * 60 + 15;
  const endMinutes = isMcx
    ? isUsDaylightSavingTime(now) ? 23 * 60 + 30 : 23 * 60 + 55
    : 15 * 60 + 30;
  const sessionLabel = isMcx
    ? `9:00 AM–${isUsDaylightSavingTime(now) ? '11:30 PM' : '11:55 PM'} IST`
    : '9:15 AM–3:30 PM IST';
  const isOpen = isWeekday && minutes >= startMinutes && minutes < endMinutes;

  return {
    isOpen,
    message: isOpen ? 'Market Open' : MARKET_CLOSED_MESSAGE,
    sessionLabel,
  };
}
