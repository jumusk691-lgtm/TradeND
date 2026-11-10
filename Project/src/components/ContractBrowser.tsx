
import { ChevronDown, Plus, Search, Star, BarChart2 } from 'lucide-react';
import { useMemo, useState, useEffect, useRef } from 'react';
import type { DerivativeKind, Exchange } from '@/types';

const DB_FILE_URL =
  'https://fnfynhgkdevxytxtfzrk.supabase.co/storage/v1/object/public/myt/angel_master.db';

const RENDER_WS_URL = 'wss://myt-backend-1.onrender.com/ws';

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

function formatExpiryDate(rawExpiry: string): string {
  if (!rawExpiry) return '';
  if (/[a-zA-Z]/.test(rawExpiry)) return rawExpiry;

  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

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

function formatSymbolName(rawSymbol: string): string {
  try {
    if (!rawSymbol) return '';

    const monthNames = [
      'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
      'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
    ];

    const upper = rawSymbol.toUpperCase();

    for (const month of monthNames) {
      if (upper.includes(month)) return rawSymbol;
    }

    const match2 = upper.match(/^([A-Z]+)(\d{2})(1[0-2])(\d{2})(.*)$/);

    if (match2) {
      const [, prefix, yy, mm, dd, rest] = match2;
      return `${prefix}${yy}${monthNames[parseInt(mm, 10) - 1]}${dd}${rest}`;
    }

    const match1 = upper.match(/^([A-Z]+)(\d{2})([1-9])(\d{2})(.*)$/);

    if (match1) {
      const [, prefix, yy, mm, dd, rest] = match1;
      return `${prefix}${yy}${monthNames[parseInt(mm, 10) - 1]}${dd}${rest}`;
    }

    const matchLetter = upper.match(/^([A-Z]+)(\d{2})([OND])(\d{2})(.*)$/);

    if (matchLetter) {
      const [, prefix, yy, monthLetter, dd, rest] = matchLetter;

      const monthMap: Record<string, string> = {
        O: 'OCT',
        N: 'NOV',
        D: 'DEC'
      };

      return `${prefix}${yy}${monthMap[monthLetter]}${dd}${rest}`;
    }
  } catch (error) {
    console.error('Format symbol error:', error);
  }

  return rawSymbol;
}

export function ContractBrowser({
  selected,
  onSelect,
  onAddWatch,
  watchlist,
  onOpenChart
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
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchlistRef = useRef<any[]>(watchlist);

  const pendingKeysRef = useRef<{
    keys: string[];
    tokens: string[];
  }>({ keys: [], tokens: [] });

  useEffect(() => {
    watchlistRef.current = watchlist;
  }, [watchlist]);

  // Watchlist ke complete contract data se subscriptions
  const sendSubscriptions = (ws: WebSocket) => {
    if (ws.readyState !== WebSocket.OPEN) return;

    const watchKeys = watchlistRef.current
      .map((item: any) => item?.instrumentKey || '')
      .filter(Boolean);

    const watchTokens = watchlistRef.current
      .map((item: any) => item?.token || '')
      .filter(Boolean);

    const searchKeys = pendingKeysRef.current.keys;
    const searchTokens = pendingKeysRef.current.tokens;

    const combinedKeys = Array.from(
      new Set([...searchKeys, ...watchKeys])
    );

    const combinedTokens = Array.from(
      new Set([...searchTokens, ...watchTokens])
    );

    const indexKeys = [
      'NSE_INDEX|Nifty 50',
      'BSE_INDEX|SENSEX'
    ];

    const instrumentKeys = Array.from(
      new Set([...indexKeys, ...combinedKeys])
    );

    ws.send(JSON.stringify({
      action: 'sub',
      guid: 'upstox_sub_request',
      instrumentKeys,
      tokens: combinedTokens
    }));

    console.log('ContractBrowser subscriptions:', {
      instrumentKeys,
      tokens: combinedTokens
    });
  };

  // Render WebSocket connection
  useEffect(() => {
    let disposed = false;

    const connectWS = () => {
      if (disposed) return;

      try {
        const ws = new WebSocket(RENDER_WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('ContractBrowser connected to Render WS');
          sendSubscriptions(ws);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('ContractBrowser WS:', data);
          } catch (error) {
            console.error('WS message parse error:', error);
          }
        };

        ws.onerror = (error) => {
          console.error('ContractBrowser WS error:', error);
        };

        ws.onclose = () => {
          if (!disposed) {
            reconnectTimerRef.current = setTimeout(connectWS, 3000);
          }
        };
      } catch (error) {
        console.error('WebSocket connection error:', error);

        if (!disposed) {
          reconnectTimerRef.current = setTimeout(connectWS, 3000);
        }
      }
    };

    connectWS();

    return () => {
      disposed = true;

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }

      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      sendSubscriptions(wsRef.current);
    }
  }, [watchlist]);

  // SQLite database load
  useEffect(() => {
    let cancelled = false;

    async function initDatabase() {
      try {
        setLoading(true);
        setErrorMsg(null);

        const response = await fetch(DB_FILE_URL, {
          cache: 'no-store'
        });

        if (!response.ok) {
          throw new Error(`DB Fetch failed: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const initSqlJs = (window as any).initSqlJs;

        if (!initSqlJs) {
          throw new Error('SQL.js not loaded in index.html');
        }

        const SQL = await initSqlJs({
          locateFile: (file: string) =>
            `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        });

        if (cancelled) return;

        const db = new SQL.Database(new Uint8Array(arrayBuffer));

        setDbInstance(db);
        setLoading(false);
      } catch (error: any) {
        console.error('DB Init Error:', error);

        if (!cancelled) {
          setErrorMsg(error?.message || 'Failed to load database');
          setLoading(false);
        }
      }
    }

    initDatabase();

    return () => {
      cancelled = true;
    };
  }, []);

  // Search contracts - SELECT * se database ke saare columns milenge
  const loadSymbolsFromDb = (
    db: any,
    exFilter: string,
    kindFilter: string,
    searchQuery: string
  ) => {
    try {
      setLoading(true);

      let sql = `
        SELECT *
        FROM symbols
        WHERE 1=1
      `;

      if (exFilter !== 'ALL') {
        if (exFilter === 'NSE') {
          sql += ` AND (
            exch_seg IN ('NSE', 'NFO', 'NSE_EQ', 'NSE_FO')
            OR exch_seg LIKE 'NSE%'
            OR exch_seg LIKE 'NFO%'
          )`;
        } else if (exFilter === 'BSE') {
          sql += ` AND (
            exch_seg IN ('BSE', 'BFO', 'BSE_EQ', 'BSE_FO')
            OR exch_seg LIKE 'BSE%'
            OR exch_seg LIKE 'BFO%'
          )`;
        } else if (exFilter === 'MCX') {
          sql += ` AND (
            exch_seg IN ('MCX', 'MCX_FO')
            OR exch_seg LIKE 'MCX%'
          )`;
        }
      }

      if (kindFilter === 'CE') {
        sql += ` AND (
          symbol LIKE '%CE'
          OR instrumenttype LIKE '%CE%'
          OR (
            instrumenttype LIKE '%OPT%'
            AND symbol NOT LIKE '%PE'
          )
        )`;
      } else if (kindFilter === 'PE') {
        sql += ` AND (
          symbol LIKE '%PE'
          OR instrumenttype LIKE '%PE%'
        )`;
      } else if (kindFilter === 'FUT') {
        sql += ` AND (
          instrumenttype LIKE '%FUT%'
          OR symbol LIKE '%FUT%'
          OR instrumenttype LIKE '%COM%'
          OR strike IS NULL
          OR strike = ''
          OR strike = '0.0'
        )
        AND symbol NOT LIKE '%CE'
        AND symbol NOT LIKE '%PE'`;
      }

      const rawInput = searchQuery.trim().toUpperCase();
      const safeInput = rawInput.replace(/'/g, "''");

      if (safeInput !== '') {
        const letters = safeInput.replace(/[^A-Z]/g, '');
        const digits = safeInput.replace(/[^0-9]/g, '');

        if (letters.length > 0 && digits.length > 0) {
          sql += ` AND (
            (symbol LIKE '%${letters}%' OR name LIKE '%${letters}%')
            AND
            (symbol LIKE '%${digits}%'
             OR strike LIKE '%${digits}%'
             OR name LIKE '%${digits}%')
          )`;
        } else if (letters.length > 0) {
          sql += ` AND (
            symbol LIKE '%${letters}%'
            OR name LIKE '%${letters}%'
          )`;
        } else if (digits.length > 0) {
          sql += ` AND (
            symbol LIKE '%${digits}%'
            OR strike LIKE '%${digits}%'
            OR name LIKE '%${digits}%'
          )`;
        }
      }

      sql += ` ORDER BY expiry ASC LIMIT 400;`;

      const result = db.exec(sql);

      if (result.length > 0) {
        const columns = result[0].columns;
        const values = result[0].values;

        const parsed = values.map((row: any) => {
          const rowData: Record<string, any> = {};

          columns.forEach((column: string, index: number) => {
            rowData[column] = row[index];
          });

          const rawSymbol = String(rowData.symbol || '');
          const formattedSymbol = formatSymbolName(rawSymbol);

          const instrumentType = String(rowData.instrumenttype || '');
          const upperType = instrumentType.toUpperCase();
          const upperSymbol = formattedSymbol.toUpperCase();

          let inferredKind: DerivativeKind = 'FUT';

          if (
            upperSymbol.endsWith('CE') ||
            upperType.includes('CE')
          ) {
            inferredKind = 'CE';
          } else if (
            upperSymbol.endsWith('PE') ||
            upperType.includes('PE')
          ) {
            inferredKind = 'PE';
          } else if (
            upperSymbol.includes('FUT') ||
            upperType.includes('FUT') ||
            upperType.includes('COM')
          ) {
            inferredKind = 'FUT';
          }

          const seg = String(rowData.exch_seg || '').toUpperCase();

          let inferredExchange: Exchange = 'NSE';

          if (seg.includes('BSE') || seg.includes('BFO')) {
            inferredExchange = 'BSE';
          } else if (seg.includes('MCX')) {
            inferredExchange = 'MCX';
          }

          const rawExpiry = String(rowData.expiry || '');
          const token = String(rowData.token || '');
          const lotsize = String(rowData.lotsize || '1');
          const tickSize = String(rowData.tick_size || '0.05');
          const rawName = String(rowData.name || '');

          const instrumentKey = `${seg || 'NSE'}|${token}`;

          const formattedName = formatSymbolName(
            rawName.trim() !== '' ? rawName : formattedSymbol
          );

          // Original database ke saare fields + normalized fields
          return {
            ...rowData,

            token,
            symbol: formattedSymbol,
            rawSymbol,
            name: formattedName,

            exchange: inferredExchange,
            exch_seg: seg || 'NSE',

            instrumentKey,
            instrument_key: instrumentKey,

            lotsize,
            lotSize: Number(lotsize) || 1,

            tick_size: tickSize,
            tickSize,

            instrumenttype: instrumentType,
            instrumentType,

            kind: inferredKind,

            rawExpiry,
            expiry: formatExpiryDate(rawExpiry),

            strike:
              rowData.strike && rowData.strike !== '0.0'
                ? Number(rowData.strike)
                : undefined,

            // Original SQLite row, including any extra/FII columns
            databaseData: { ...rowData }
          };
        });

        setRawContracts(parsed);

        const keys = parsed
          .map((item: any) => item.instrumentKey)
          .filter(Boolean);

        const tokens = parsed
          .map((item: any) => item.token)
          .filter(Boolean);

        pendingKeysRef.current = { keys, tokens };

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          sendSubscriptions(wsRef.current);
        }
      } else {
        setRawContracts([]);
        pendingKeysRef.current = { keys: [], tokens: [] };

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          sendSubscriptions(wsRef.current);
        }
      }
    } catch (error) {
      console.error('Query error:', error);
      setErrorMsg('Unable to search symbols in database');
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
    const expiryMap = new Map<string, string>();

    rawContracts.forEach((contract) => {
      if (contract.rawExpiry && contract.expiry) {
        expiryMap.set(contract.rawExpiry, contract.expiry);
      }
    });

    return Array.from(expiryMap.entries())
      .map(([raw, formatted]) => ({ raw, formatted }))
      .sort((a, b) => a.raw.localeCompare(b.raw));
  }, [rawContracts]);

  const contracts = useMemo(() => {
    if (selectedExpiry === 'ALL') return rawContracts;

    return rawContracts.filter(
      (contract) => contract.rawExpiry === selectedExpiry
    );
  }, [rawContracts, selectedExpiry]);

  // Watchlist me complete contract object bhejna
  const handleAddToWatchlist = (contract: any) => {
    const completeContract = {
      ...contract,

      // Important APK-compatible fields
      token: String(contract.token || ''),
      symbol: String(contract.symbol || ''),
      name: String(contract.name || ''),
      exchange: String(contract.exchange || ''),
      exch_seg: String(contract.exch_seg || ''),
      instrumentKey: String(contract.instrumentKey || ''),
      instrument_key: String(contract.instrumentKey || ''),
      lotsize: String(contract.lotsize || '1'),
      lotSize: Number(contract.lotsize || 1),
      tick_size: String(contract.tick_size || '0.05'),
      instrumenttype: String(contract.instrumenttype || ''),

      // Full original SQLite record
      databaseData: {
        ...(contract.databaseData || {})
      }
    };

    console.log('FULL CONTRACT SENT TO WATCHLIST:', completeContract);

    onAddWatch(completeContract);
  };

  return (
    <section className="glass rounded-2xl overflow-hidden">
      <div className="border-b border-white/5 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-gold animate-pulse" />
              <h2 className="font-display text-lg font-bold text-white">
                Options &amp; Futures
              </h2>
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
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${
                expanded ? 'rotate-180' : ''
              }`}
            />
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
                      exchange === item
                        ? 'bg-accent text-white'
                        : 'text-gray-500 hover:text-white'
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
                      kind === item
                        ? 'bg-gold text-black'
                        : 'text-gray-500 hover:text-white'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <div className="text-xs text-gray-400 font-semibold">
                Expiry:
              </div>

              <select
                value={selectedExpiry}
                onChange={(event) => setSelectedExpiry(event.target.value)}
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
            <span>
              {exchange === 'ALL' ? 'All exchanges' : `${exchange} contracts`}
            </span>
            <span>{contracts.length} contracts</span>
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-gray-400">
              Loading contracts from DB...
            </div>
          ) : errorMsg ? (
            <div className="py-8 text-center text-xs text-rose-400">
              Error: {errorMsg}
            </div>
          ) : (
            <div className="space-y-1.5">
              {contracts.map((contract) => {
                const selectedContract = selected === contract.symbol;

                const watched = watchlist.some((item: any) =>
                  typeof item === 'string'
                    ? item === contract.symbol
                    : (
                        item?.symbol === contract.symbol ||
                        item?.token === contract.token
                      )
                );

                return (
                  <div
                    key={contract.token || contract.symbol}
                    className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                      selectedContract
                        ? 'border-accent/40 bg-accent/10'
                        : 'border-white/5 bg-white/[0.015]'
                    }`}
                  >
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

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                        <span className="text-gold font-medium">
                          {contract.exchange}
                        </span>

                        {contract.expiry && (
                          <>
                            <span>·</span>
                            <span>
                              Exp: <strong className="text-white">{contract.expiry}</strong>
                            </span>
                          </>
                        )}

                        {contract.strike !== undefined && (
                          <>
                            <span>·</span>
                            <span>
                              Strike: <strong className="text-white">{contract.strike}</strong>
                            </span>
                          </>
                        )}

                        <span>·</span>

                        <span>
                          Lot: <strong className="text-white">{contract.lotsize}</strong>
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelect(contract.symbol);
                        if (onOpenChart) onOpenChart(contract);
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/40 text-accent hover:bg-accent/20 transition-colors cursor-pointer"
                      title="Open Chart"
                    >
                      <BarChart2 className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleAddToWatchlist(contract);
                      }}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border cursor-pointer ${
                        watched
                          ? 'border-gold/30 bg-gold/10 text-gold'
                          : 'border-white/5 text-gray-600'
                      }`}
                      title={watched ? 'Added to Watchlist' : 'Add to Watchlist'}
                    >
                      <Star
                        className={`h-4 w-4 ${watched ? 'fill-gold' : ''}`}
                      />
                    </button>

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
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

export default ContractBrowser;
