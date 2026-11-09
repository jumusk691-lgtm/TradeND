import { ChevronDown, Plus, Search, Star, BarChart2 } from 'lucide-react';
import { useMemo, useState, useEffect, useRef } from 'react';
import type { DerivativeKind, Exchange } from '@/types';

// 👉 Supabase DB File URL (Direct Database Access for Symbols)
const DB_FILE_URL = "https://fnfynhgkdevxytxtfzrk.supabase.co/storage/v1/object/public/myt/angel_master.db";

interface ContractBrowserProps {
  selected: string;
  onSelect: (symbol: string) => void;
  onAddWatch: (contract: any) => void;
  watchlist: any[];
  onOpenChart?: (contract: any) => void;
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

// Format Symbol Names
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
  onOpenChart,
}: ContractBrowserProps) {
  const [exchange, setExchange] = useState<ExchangeFilter>('NSE');
  const [kind, setKind] = useState<ContractFilter>('ALL');
  const [search, setSearch] = useState('');
  const [selectedExpiry, setSelectedExpiry] = useState<string>('ALL');
  const [expanded, setExpanded] = useState(true);

  const [dbInstance, setDbInstance] = useState<any>(null);
  const [rawContracts, setRawContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pendingKeysRef = useRef<{ keys: string[]; tokens: string[] }>({ keys: [], tokens: [] });

  // 1. Initialize SQLite Database from Supabase DB File URL
  useEffect(() => {
    async function initDatabase() {
      try {
        setLoading(true);
        setErrorMsg(null);

        const response = await fetch(DB_FILE_URL, { cache: 'no-store' });
        if (!response.ok) throw new Error(`DB Fetch failed: ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();

        //@ts-ignore
        const initSqlJs = window.initSqlJs;
        if (!initSqlJs) throw new Error('SQL.js not loaded in index.html');

        const SQL = await initSqlJs({
          locateFile: (file: string) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        });

        const db = new SQL.Database(new Uint8Array(arrayBuffer));
        setDbInstance(db);
        loadSymbolsFromDb(db, 'NSE', 'ALL', '');
      } catch (err: any) {
        console.error('DB Init Error:', err);
        setErrorMsg(err?.message || 'Failed to load database');
        setLoading(false);
      }
    }

    initDatabase();
  }, []);

  // 2. Local Dynamic WebSocket Connection (Updated to send Watchlist keys dynamically)
  useEffect(() => {
    function connectWS() {
      if (typeof window === 'undefined') return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("🟢 Connected to Live WebSocket");
        
        // Combine search keys and watchlist keys
        const watchKeys = watchlist.map((w: any) => w.instrumentKey).filter(Boolean);
        const watchTokens = watchlist.map((w: any) => w.token).filter(Boolean);
        
        const searchKeys = pendingKeysRef.current.keys;
        const searchTokens = pendingKeysRef.current.tokens;

        const combinedKeys = Array.from(new Set([...searchKeys, ...watchKeys]));
        const combinedTokens = Array.from(new Set([...searchTokens, ...watchTokens]));

        if (combinedKeys.length > 0 && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            instrumentKeys: combinedKeys,
            tokens: combinedTokens
          }));
        }
      };

      ws.onerror = (err) => {
        console.error("WS Error:", err);
      };

      ws.onclose = () => {
        setTimeout(connectWS, 3000);
      };
    }

    connectWS();

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [watchlist]); // Watchlist dependency added so new items auto-subscribe via WebSocket

  // 3. Query Symbols directly from local SQLite database instance
  const loadSymbolsFromDb = (db: any, exFilter: string, kindFilter: string, searchQuery: string) => {
    try {
      setLoading(true);
      let sql = `SELECT token, symbol, exch_seg, strike, expiry, name, lotsize, tick_size, instrumenttype FROM symbols WHERE 1=1`;
      
      if (exFilter !== 'ALL') {
        if (exFilter === 'NSE') sql += ` AND (exch_seg IN ('NSE', 'NFO', 'NSE_EQ', 'NSE_FO') OR exch_seg LIKE 'NSE%')`;
        else if (exFilter === 'BSE') sql += ` AND (exch_seg IN ('BSE', 'BFO', 'BSE_EQ', 'BSE_FO') OR exch_seg LIKE 'BSE%')`;
        else if (exFilter === 'MCX') sql += ` AND (exch_seg IN ('MCX', 'MCX_FO') OR exch_seg LIKE 'MCX%')`;
      }

      if (kindFilter === 'CE') {
        sql += ` AND (symbol LIKE '%CE' OR instrumenttype LIKE '%CE%' OR (instrumenttype LIKE '%OPT%' AND symbol NOT LIKE '%PE'))`;
      } else if (kindFilter === 'PE') {
        sql += ` AND (symbol LIKE '%PE' OR instrumenttype LIKE '%PE%')`;
      } else if (kindFilter === 'FUT') {
        sql += ` AND (instrumenttype LIKE '%FUT%' OR symbol LIKE '%FUT%' OR instrumenttype LIKE '%COM%' OR (strike IS NULL OR strike = '' OR strike = '0.0')) AND symbol NOT LIKE '%CE' AND symbol NOT LIKE '%PE'`;
      }

      if (searchQuery.trim() !== '') {
        const rawInput = searchQuery.trim().toUpperCase();
        const letters = rawInput.replace(/[^A-Z]/g, '');
        const digits = rawInput.replace(/[^0-9]/g, '');

        if (letters.length > 0 && digits.length > 0) {
          sql += ` AND ((symbol LIKE '%${letters}%' OR name LIKE '%${letters}%') AND (symbol LIKE '%${digits}%' OR strike LIKE '%${digits}%' OR name LIKE '%${digits}%'))`;
        } else if (letters.length > 0) {
          sql += ` AND (symbol LIKE '%${letters}%' OR name LIKE '%${letters}%')`;
        } else if (digits.length > 0) {
          sql += ` AND (symbol LIKE '%${digits}%' OR strike LIKE '%${digits}%' OR name LIKE '%${digits}%')`;
        }
      }

      sql += ` ORDER BY expiry ASC LIMIT 400;`;

      const res = db.exec(sql);
      if (res.length > 0) {
        const columns = res[0].columns;
        const values = res[0].values;

        const parsed = values.map((row: any) => {
          const rowData: Record<string, any> = {};
          columns.forEach((col: string, idx: number) => {
            rowData[col] = row[idx];
          });

          const rawSym = rowData.symbol ? String(rowData.symbol) : '';
          const sym = formatSymbolName(rawSym);

          let inferredKind: DerivativeKind = 'FUT';
          if (sym.endsWith('CE') || String(rowData.instrumenttype || '').includes('CE')) inferredKind = 'CE';
          else if (sym.endsWith('PE') || String(rowData.instrumenttype || '').includes('PE')) inferredKind = 'PE';
          else if (sym.includes('FUT') || String(rowData.instrumenttype || '').includes('FUT') || String(rowData.instrumenttype || '').includes('COM')) inferredKind = 'FUT';

          let exch: Exchange = 'NSE';
          const seg = String(rowData.exch_seg || '').toUpperCase();
          if (seg.includes('BSE') || seg.includes('BFO')) exch = 'BSE';
          else if (seg.includes('MCX')) exch = 'MCX';

          const rawExp = rowData.expiry ? String(rowData.expiry) : '';
          const tokenVal = String(rowData.token || '');
          const exactSeg = seg || 'NSE';
          const instrumentKey = `${exactSeg}|${tokenVal}`;

          return {
            token: tokenVal,
            instrumentKey: instrumentKey,
            symbol: sym,
            name: rowData.name ? formatSymbolName(String(rowData.name)) : sym,
            exchange: exch,
            kind: inferredKind,
            rawExpiry: rawExp,
            expiry: formatExpiryDate(rawExp),
            strike: rowData.strike && rowData.strike !== '0.0' ? Number(rowData.strike) : undefined,
            lotsize: String(rowData.lotsize || '1'),
            tick_size: String(rowData.tick_size || '0.05')
          };
        });

        setRawContracts(parsed);

        const keys = parsed.map((p: any) => p.instrumentKey);
        const tokens = parsed.map((p: any) => p.token);
        
        pendingKeysRef.current = { keys, tokens };

        const watchKeys = watchlist.map((w: any) => w.instrumentKey).filter(Boolean);
        const combinedKeys = Array.from(new Set([...keys, ...watchKeys]));

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ 
            instrumentKeys: combinedKeys, 
            tokens: tokens 
          }));
        }
      } else {
        setRawContracts([]);
        pendingKeysRef.current = { keys: [], tokens: [] };
      }
    } catch (e) {
      console.error('Query error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dbInstance) {
      setSelectedExpiry('ALL');
      loadSymbolsFromDb(dbInstance, exchange, kind, search);
    }
  }, [exchange, kind, search, dbInstance]);

  const availableExpiries = useMemo(() => {
    const expMap = new Map<string, string>();
    rawContracts.forEach(c => {
      if (c.rawExpiry && c.expiry) expMap.set(c.rawExpiry, c.expiry);
    });
    return Array.from(expMap.entries())
      .map(([raw, formatted]) => ({ raw, formatted }))
      .sort((a, b) => a.raw.localeCompare(b.raw));
  }, [rawContracts]);

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
              Supabase DB symbols
            </p>
          </div>
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-semibold text-gray-400 hover:text-white transition-colors cursor-pointer"
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
                    type="button"
                    onClick={() => setExchange(item)}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
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
                    type="button"
                    onClick={() => setKind(item)}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                      kind === item ? 'bg-gold text-black' : 'text-gray-500 hover:text-white'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {/* Expiry Dropdown */}
            <div className="mt-3 flex items-center gap-2">
              <div className="text-xs text-gray-400 font-semibold">Expiry:</div>
              <select
                value={selectedExpiry}
                onChange={(e) => setSelectedExpiry(e.target.value)}
                className="rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-xs font-bold text-accent focus:outline-none cursor-pointer"
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
            <div className="py-8 text-center text-xs text-gray-400">Loading contracts from DB...</div>
          ) : errorMsg ? (
            <div className="py-8 text-center text-xs text-rose-400">Error: {errorMsg}</div>
          ) : (
            <div className="space-y-1.5">
              {contracts.map((contract) => {
                const selectedContract = selected === contract.symbol;
                const watched = watchlist.some((w: any) => 
                  typeof w === 'string' ? w === contract.symbol : (w?.symbol === contract.symbol || w?.token === contract.token)
                );
                
                return (
                  <div
                    key={contract.token || contract.symbol}
                    className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                      selectedContract ? 'border-accent/40 bg-accent/10' : 'border-white/5 bg-white/[0.015]'
                    }`}
                  >
                    {/* Symbol Click / Selection Button */}
                    <button
                      type="button"
                      onClick={() => onSelect(contract.symbol)}
                      className="min-w-0 flex-1 text-left cursor-pointer bg-transparent border-none p-0"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-bold text-white sm:text-[15px]">
                          {contract.name}
                        </span>
                        <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-extrabold text-accent-200">
                          {contract.kind}
                        </span>
                      </div>
                      
                      {/* Clean Meta: Exchange, Expiry, Strike & Lot Size */}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                        <span className="text-gold font-medium">{contract.exchange}</span>
                        {contract.expiry && (
                          <>
                            <span>·</span>
                            <span>Exp: <strong className="text-white">{contract.expiry}</strong></span>
                          </>
                        )}
                        {contract.strike && (
                          <>
                            <span>·</span>
                            <span>Strike: <strong className="text-white">{contract.strike}</strong></span>
                          </>
                        )}
                        <span>·</span>
                        <span>Lot: <strong className="text-white">{contract.lotsize}</strong></span>
                      </div>
                    </button>

                    {/* Chart Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(contract.symbol);
                        if (onOpenChart) onOpenChart(contract);
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/40 text-accent hover:bg-accent/20 transition-colors cursor-pointer"
                      title="Open Chart"
                    >
                      <BarChart2 className="h-4 w-4" />
                    </button>

                    {/* Star / Add to Watchlist Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddWatch(contract);
                      }}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border cursor-pointer ${
                        watched ? 'border-gold/30 bg-gold/10 text-gold' : 'border-white/5 text-gray-600'
                      }`}
                      title={watched ? "Added to Watchlist" : "Add to Watchlist"}
                    >
                      <Star className={`h-4 w-4 ${watched ? 'fill-gold' : ''}`} />
                    </button>

                    {/* Trade Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(contract.symbol);
                      }}
                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-gold px-2.5 text-[11px] font-extrabold text-black cursor-pointer"
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
