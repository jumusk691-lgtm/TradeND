import { INSTRUMENTS } from '@/data/instruments';
import { fmtNum, fmtPct } from '@/lib/format';

interface TickerProps {
  livePrices: Record<string, number>;
}

export function Ticker({ livePrices }: TickerProps) {
  // Duplicate list for seamless loop
  const items = [...INSTRUMENTS, ...INSTRUMENTS];

  return (
    <div className="relative overflow-hidden border-y border-white/5 bg-black/60">
      <div className="flex whitespace-nowrap animate-[ticker_40s_linear_infinite] py-2">
        {items.map((inst, i) => {
          const price = livePrices[inst.symbol] ?? inst.price;
          const chgAbs = price - inst.prevClose;
          const chgPct = (chgAbs / inst.prevClose) * 100;
          const up = chgAbs >= 0;
          return (
            <span
              key={`${inst.symbol}-${i}`}
              className="mx-5 inline-flex items-center gap-2 text-xs"
            >
              <span className="font-semibold text-gray-300">{inst.symbol}</span>
              <span className="font-mono text-white">{fmtNum(price)}</span>
              <span className={`font-mono ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
                {up ? '▲' : '▼'} {fmtPct(chgPct)}
              </span>
              <span className="text-gray-700">|</span>
            </span>
          );
        })}
      </div>
      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
