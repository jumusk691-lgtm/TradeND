import { ChevronDown, Plus, Search, Star } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';
import { fmtNum, fmtPct } from '@/lib/format';
import type { DerivativeKind, Exchange } from '@/types';

const DB_FILE_URL = "https://fnfynhgkdevxytxtfzrk.supabase.co/storage/v1/object/public/myt/angel_master.db";

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
  const [expanded, setExpanded] = useState(true);

  const [derivativeContracts, setDerivativeContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadAndParseDbFile() {
      try {
        setLoading(true);
        setErrorMsg(null);

        // 1. Supabase se direct .db file fetch karo
        const response = await fetch(DB_FILE_URL, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Failed to fetch database file: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();

        // 2. Global window.initSqlJs ka use karo (No npm install needed)
        //@ts-ignore
        const initSqlJs = window.initSqlJs;
        if (!initSqlJs) {
          throw new Error('SQL.js script not loaded in index.html');
        }

        const SQL = await initSqlJs({
          locateFile: (file: string) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        });

        const db = new SQL.Database(new Uint8Array(arrayBuffer));

        const query = `
          SELECT token, symbol, exch_seg, strike, expiry, name, lotsize, tick_size, instrumenttype 
          FROM symbols 
          LIMIT 500
        `;
        const res = db.exec(query);

        if (res.length > 0) {
          const columns = res[0].columns;
          const values = res[0].values;

          const parsedList = values.map((row: any) => {
            const rowData: Record<string, any> = {};
            columns.forEach((col: string, idx: number) => {
              rowData[col] = row[idx];
            });

            const rawSym = rowData.symbol ? String(rowData.symbol) : '';
            const sym = formatSymbolName(rawSym);

            let inferredKind: DerivativeKind = 'FUT';
            if (sym.endsWith('CE')) inferredKind = 'CE';
            else if (sym.endsWith('PE')) inferredKind = 'PE';
            else if (rowData.instrumenttype?.includes('FUT') || rowData.instrumenttype?.includes('COM')) inferredKind = 'FUT';

            let exch: Exchange = 'NSE';
            const seg = String(rowData.exch_seg || '').toUpperCase();
            if (seg.includes('BSE') || seg.includes('BFO')) exch = 'BSE';
            else if (seg.includes('MCX')) exch = 'MCX';

            return {
              token: String(rowData.token || ''),
              symbol: sym,
              name: rowData.name ? formatSymbolName(String(rowData.name)) : sym,
              exchange: exch,
              kind: inferredKind,
              expiry: rowData.expiry ? String(rowData.expiry) : '',
              strike: rowData.strike ? Number(rowData.strike) : undefined,
              price: 100.0,
              changePct: 0.0,
              lotsize: String(rowData.lotsize || '1'),
              tick_size: String(rowData.tick_size || '0.05')
            };
          });

          setDerivativeContracts(parsedList);
        } else {
          setDerivativeContracts([]);
        }

        db.close();
      } catch (err: any) {
        console.error('Error reading Supabase .db file:', err);
        setErrorMsg(err?.message || 'Failed to parse database file');
      } finally {
        setLoading(false);
      }
    }

    loadAndParseDbFile();
  }, []);

  const contracts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return derivativeContracts.filter((contract) => {
      if (exchange !== 'ALL' && contract.exchange !== exchange) return false;
      if (kind !== 'ALL' && contract.kind !== kind) return false;
      if (query && !contract.name.toLowerCase().includes(query) && !contract.symbol.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [derivativeContracts, exchange, kind, search]);

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
              Live parsed contracts directly from Supabase DB file
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

            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search NIFTY, SENSEX, GOLD, strike..."
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
            <div className="py-8 text-center text-xs text-gray-400">Loading database from Supabase...</div>
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
