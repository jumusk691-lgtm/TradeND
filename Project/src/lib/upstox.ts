export const RENDER_BACKEND_URL = 'https://myt-backend-1.onrender.com';

export interface MarginRequest {
  instrumentKey: string;
  quantity: number;
  transactionType: 'BUY' | 'SELL';
  product: 'I' | 'D';
  price?: number;
}

export interface MarginResult {
  requiredMargin: number;
  finalMargin: number;
  availableMargin?: number;
}

function readNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

export async function fetchUpstoxMargin(request: MarginRequest): Promise<MarginResult> {
  const response = await fetch(`${RENDER_BACKEND_URL}/api/margin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instrument_key: request.instrumentKey,
      quantity: request.quantity,
      transaction_type: request.transactionType,
      product: request.product,
      ...(request.price && request.price > 0 ? { price: request.price } : {}),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Margin calculation is unavailable.');
  }

  const data = payload.data ?? payload;
  const requiredMargin = readNumber(data.required_margin ?? data.requiredMargin ?? data.margin);
  const finalMargin = readNumber(data.final_margin ?? data.finalMargin) ?? requiredMargin;
  if (requiredMargin === undefined || finalMargin === undefined) {
    throw new Error('Margin calculation returned an invalid response.');
  }

  return {
    requiredMargin,
    finalMargin,
    availableMargin: readNumber(data.available_margin ?? data.availableMargin),
  };
}
