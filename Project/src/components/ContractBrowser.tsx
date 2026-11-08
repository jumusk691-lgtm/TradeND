import { ChevronDown, Plus, Search, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DERIVATIVE_CONTRACTS } from '@/data/derivatives';
import { fmtNum, fmtPct } from '@/lib/format';
import type { DerivativeKind, Exchange } from '@/types';

interface ContractBrowserProps {
  selected: string;
  onSelect: (symbol: string) => void;
  onAddWatch: (symbol: string) => void;
  watchlist: string[];
}

type ExchangeFilter = Exchange | 'ALL';
type ContractFilter = DerivativeKind | 'ALL';

const exchanges: ExchangeFilter[] = ['ALL', 'NSE', 'BSE', 'MCX'];
const kinds: ContractFilter[] = ['ALL', 'FUT', 'CE', 'PE'];

export function ContractBrowser({
  selected,
  onSelect,
  onAddWatch,
  watchlist,
}: ContractBrowserProps) {
  const [exchange, setExchange] = useState<ExchangeFilter>('NSE');
  const [kind, setKind] = useState<ContractFilter>('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(true);

  const contracts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return DERIVATIVE_CONTRACTS.filter((contract) => {
      if (exchange !== 'ALL' && contract.exchange !== exchange) return false;
      if (kind !== 'ALL' && contract.kind !== kind) return false;
      if (query && !contract.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [exchange, kind, search]);

  return (
    <section className="glass rounded-2xl overflow-hidden">
      <div className="border-b border-white/5 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-gold animate-pulse" />
              <h2 className="font-display text-lg font-bold text-white">Options &amp; Futures</h2>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Trade NSE, BSE &amp; MCX contracts with live paper prices.
            </p>
          </div>
          <button
            onClick={() => setExpanded((open) => !open)}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-semibold text-gray-400 hover:text-white transition-colors"
            aria-expanded={expanded}
          >
            {expanded ? 'Hide' : 'Show'}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {expanded && (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-white/5 bg-black/40 p-1">
                {exchanges.map((item) => (
                  <button
                    key={item}
                    onClick={() => setExchange(item)}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                      exchange === item
                        ? 'bg-accent text-white'
                        : 'text-gray-500 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-white/5 bg-black/40 p-1">
                {kinds.map((item) => (
                  <button
                    key={item}
                    onClick={() => setKind(item)}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                      kind === item
                        ? item === 'CE'
                          ? 'bg-emerald-500 text-white'
                          : item === 'PE'
                            ? 'bg-rose-500 text-white'
                            : 'bg-gold text-black'
                        : 'text-gray-500 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {item === 'ALL' ? 'ALL' : item === 'FUT' ? 'FUTURES' : item}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search NIFTY, SENSEX, GOLD, strike..."
                className="w-full rounded-lg border border-white/5 bg-black/40 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-gray-600 focus:border-accent/50 focus:outline-none"
              />
            </div>
          </>
        )}
      </div>

      {expanded && (
        <div className="max-h-[410px] overflow-y-auto scrollbar-thin p-2 sm:p-3">
          <div className="mb-2 flex items-center justify-between px-2 text-[10px] uppercase tracking-[0.16em] text-gray-600">
            <span>{exchange === 'ALL' ? 'All exchanges' : `${exchange} contracts`}</span>
            <span>{contracts.length} contracts</span>
          </div>
          <div className="space-y-1.5">
            {contracts.map((contract) => {
              const selectedContract = selected === contract.symbol;
              const watched = watchlist.includes(contract.symbol);
              const up = contract.changePct >= 0;
              return (
                <div
                  key={contract.symbol}
                  className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                    selectedContract
                      ? 'border-accent/40 bg-accent/10'
                      : 'border-white/5 bg-white/[0.015] hover:border-white/10 hover:bg-white/[0.035]'
                  }`}
                >
                  <button
                    onClick={() => onSelect(contract.symbol)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-bold text-white sm:text-[15px]">
                        {contract.name}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold ${
                          contract.kind === 'CE'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : contract.kind === 'PE'
                              ? 'bg-rose-500/20 text-rose-300'
                              : 'bg-accent/20 text-accent-200'
                        }`}
                      >
                        {contract.kind}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500">
                      <span>{contract.exchange}</span>
                      <span>·</span>
                      <span>{contract.expiry}</span>
                      {contract.strike && (
                        <>
                          <span>·</span>
                          <span>Strike {contract.strike.toLocaleString('en-IN')}</span>
                        </>
                      )}
                    </div>
                  </button>

                  <div className="text-right">
                    <div className="font-mono text-sm font-semibold text-white">
                      {fmtNum(contract.price)}
                    </div>
                    <div className={`font-mono text-[11px] ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {up ? '▲' : '▼'} {fmtPct(contract.changePct)}
                    </div>
                  </div>

                  <button
                    onClick={() => onAddWatch(contract.symbol)}
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      watched
                        ? 'border-gold/30 bg-gold/10 text-gold'
                        : 'border-white/5 text-gray-600 hover:border-gold/30 hover:text-gold'
                    }`}
                    aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
                  >
                    <Star className={`h-4 w-4 ${watched ? 'fill-gold' : ''}`} />
                  </button>

                  <button
                    onClick={() => onSelect(contract.symbol)}
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-gold px-2.5 text-[11px] font-extrabold text-black transition-transform hover:scale-105 active:scale-95"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Trade
                  </button>
                </div>
              );
            })}
            {contracts.length === 0 && (
              <div className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-gray-500">
                No contracts match this filter.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
