import { ChevronDown, Plus, Search, Star } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';
import { fmtNum, fmtPct } from '@/lib/format';
import type { DerivativeKind, Exchange } from '@/types';

// Single Source of Truth: Centralized Render Backend API URL for Symbols, Watchlist, Positions & Charts
const RENDER_API_URL = "https://myt-backend-1.onrender.com";

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

// Format Raw Expiry (e.g., 2026-11-17 -> 17 Nov 2026)
function formatExpiryDate(rawExpiry: string): string {
  if (!rawExpiry) return '';
  if (/[a-zA-Z]/.test(rawExpiry)) return rawExpiry;

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const parts = rawExpiry.split('-');
  if (parts.length === 3) {
    const year = parts[0];
    const monthIndex = parseInt(parts[1], 10) - 1;
    const day = parts[2];
    if (monthIndex >= 0 && monthIndex < 12) {
      return `${day} ${monthNames[monthIndex]} ${year}`;
    }
  }
  return rawExpiry;
}

// Format Symbol Names (e.g. NIFTY26NOV25000CE)
function formatSymbolName(rawSymbol: string): string {
  if (!rawSymbol) return '';
  const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  for (const m of monthNames) {
    if (rawSymbol.toUpperCase().includes(m)) return rawSymbol;
  }
  const match2 = rawSymbol.match(/^([A-Za-z]+)(\d{2})(1[0-2])(\d{2})(.*)$/);
  if (match2) {
    const [, prefix, yy, mm, dd, rest] = match2;
    const monthStr = monthNames[parseInt(mm, 10) - 1];
    return `${prefix.toUpperCase()}${yy}${monthStr}${dd}${rest}`;
  }
  const match1 = rawSymbol.match(/^([A-Za-z]+)(\d{2})([1-9])(\d{2})(.*)$/);
  if (match1) {
    const [, prefix, yy, mm, dd, rest] = match1;
    const monthStr = monthNames[parseInt(mm, 10) - 1];
    return `${prefix.toUpperCase()}${yy}${monthStr}${dd}${rest}`;
  }
  return rawSymbol;
}

export function ContractBrowser({
  selected,
  onSelect,
  onAddWatch,
  watchlist,
}: ContractBrowserProps) {
  const [exchange, setExchange] = useState<ExchangeFilter>('NSE');
  const [kind, setKind] = useState<ContractFilter>('ALL');
  const [search, setSearch] = useState('');
  const [selectedExpiry, setSelectedExpiry] = useState<string>('ALL');
  const [expanded, setExpanded] = useState(true);

  const [rawContracts, setRawContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch Live Symbols from Render Backend API
  const fetchSymbolsFromRender = async (exFilter: string, kindFilter: string, searchQuery: string) => {
    try {
      setLoading(true);
      setErrorMsg(null);

      const params = new URLSearchParams({
        exchange: exFilter,
        kind: kindFilter,
        search: searchQuery
      });

      const response = await fetch(`${RENDER_API_URL}/api/symbols?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error(`Render API Error: ${response.statusText}`);
      }

      const data = await response.json();
      const symbolList = Array.isArray(data) ? data : (data.symbols || data.data || []);

      const parsed = symbolList.map((item: any) => {
        const rawSym = item.symbol ? String(item.symbol) : '';
        const sym = formatSymbolName(rawSym);

        let inferredKind: DerivativeKind = 'FUT';
        if (sym.endsWith('CE') || String(item.instrumenttype || item.kind || '').includes('CE')) inferredKind = 'CE';
        else if (sym.endsWith('PE') || String(item.instrumenttype || item.kind || '').includes('PE')) inferredKind = 'PE';
        else if (sym.includes('FUT') || String(item.instrumenttype || item.kind || '').includes('FUT')) inferredKind = 'FUT';

        let exch: Exchange = 'NSE';
        const seg = String(item.exch_seg || item.exchange || '').toUpperCase();
        if (seg.includes('BSE') || seg.includes('BFO')) exch = 'BSE';
        else if (seg.includes('MCX')) exch = 'MCX';

        const rawExp = item.expiry ? String(item.expiry) : '';

        return {
          token: String(item.token || ''),
          symbol: sym,
          name: item.name ? formatSymbolName(String(item.name)) : sym,
          exchange: exch,
          kind: inferredKind,
          rawExpiry: rawExp,
          expiry: formatExpiryDate(rawExp),
          strike: item.strike && item.strike !== '0.0' ? Number(item.strike) : undefined,
          price: item.price ? Number(item.price) : 100.0,
          changePct: item.changePct ? Number(item.changePct) : 0.0,
          lotsize: String(item.lotsize || '1'),
          tick_size: String(item.tick_size || '0.05')
        };
      });

      setRawContracts(parsed);
    } catch (err: any) {
      console.error('Fetch error from Render backend:', err);
      setErrorMsg(err?.message || 'Failed to fetch symbols from Render backend');
      setRawContracts([]);
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch when filters or search change with debounce
  useEffect(() => {
    setSelectedExpiry('ALL');
    const timer = setTimeout(() => {
      fetchSymbolsFromRender(exchange, kind, search);
    }, 300);

    return () => clearTimeout(timer);
  }, [exchange, kind, search]);

  // Expiries List sorted chronologically
  const availableExpiries = useMemo(() => {
    const expMap = new Map<string, string>();
    rawContracts.forEach(c => {
      if (c.rawExpiry && c.expiry) {
        expMap.set(c.rawExpiry, c.expiry);
      }
    });

    return Array.from(expMap.entries())
      .map(([raw, formatted]) => ({ raw, formatted }))
      .sort((a, b) => a.raw.localeCompare(b.raw));
  }, [rawContracts]);

  // Filtered Contracts by Selected Expiry
  const contracts = useMemo(() => {
    if (selectedExpiry === 'ALL') return rawContracts;
    return rawContracts.filter(c => c.rawExpiry === selectedExpiry);
  }, [rawContracts, selectedExpiry]);

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
              Live data stream via Render backend API
            </p>
          </div>
          <button
            onClick={() => setExpanded((open) => !open)}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-semibold text-gray-400 hover:text-white transition-colors"
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
                      exchange === item ? 'bg-accent text-white' : 'text-gray-500 hover:text-white'
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
                      kind === item ? 'bg-gold text-black' : 'text-gray-500 hover:text-white'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {/* Broker Style Expiry Select Dropdown */}
            <div className="mt-3 flex items-center gap-2">
              <div className="text-xs text-gray-400 font-semibold">Expiry:</div>
              <select
                value={selectedExpiry}
                onChange={(e) => setSelectedExpiry(e.target.value)}
                className="rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-xs font-bold text-accent focus:outline-none"
              >
                <option value="ALL">All Expiries</option>
                {availableExpiries.map((item) => (
                  <option key={item.raw} value={item.raw}>
                    {item.formatted}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search NIFTY, GOLD, SILVER, strike..."
                className="w-full rounded-lg border border-white/5 bg-black/40 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-gray-600 focus:outline-none"
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

          {loading ? (
            <div className="py-8 text-center text-xs text-gray-400">Fetching live data from Render backend...</div>
          ) : errorMsg ? (
            <div className="py-8 text-center text-xs text-rose-400">Error: {errorMsg}</div>
          ) : (
            <div className="space-y-1.5">
              {contracts.map((contract) => {
                const selectedContract = selected === contract.symbol;
                const watched = watchlist.includes(contract.symbol);
                const up = (contract.changePct ?? 0) >= 0;
                return (
                  <div
                    key={contract.token || contract.symbol}
                    className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                      selectedContract ? 'border-accent/40 bg-accent/10' : 'border-white/5 bg-white/[0.015]'
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
                        <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-extrabold text-accent-200">
                          {contract.kind}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-500">
                        <span>{contract.exchange}</span>
                        {contract.expiry && (
                          <>
                            <span>·</span>
                            <span>{contract.expiry}</span>
                          </>
                        )}
                        {contract.strike && (
                          <>
                            <span>·</span>
                            <span>Strike {contract.strike}</span>
                          </>
                        )}
                      </div>
                    </button>

                    <div className="text-right">
                      <div className="font-mono text-sm font-semibold text-white">
                        {fmtNum(contract.price)}
                      </div>
                      <div className={`font-mono text-[11px] ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {up ? '▲' : '▼'} {fmtPct(contract.changePct ?? 0)}
                      </div>
                    </div>

                    <button
                      onClick={() => onAddWatch(contract.symbol)}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${
                        watched ? 'border-gold/30 bg-gold/10 text-gold' : 'border-white/5 text-gray-600'
                      }`}
                    >
                      <Star className={`h-4 w-4 ${watched ? 'fill-gold' : ''}`} />
                    </button>

                    <button
                      onClick={() => onSelect(contract.symbol)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-gold px-2.5 text-[11px] font-extrabold text-black"
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
          )}
        </div>
      )}
    </section>
  );
}
