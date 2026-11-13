import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowUpRight, Check, Code2, Copy, FileCode2, Search } from 'lucide-react';
import sourceDocument from '@/data/complete-source.md?raw';

interface SourceFile {
  path: string;
  language: string;
  content: string;
}

const sourceBlockPattern = /^## `([^`]+)`[ \t]*\r?\n\r?\n(`{3,})([a-z0-9]+)[ \t]*\r?\n([\s\S]*?)\r?\n\2[ \t]*(?=\r?$)/gim;

const sourceFiles: SourceFile[] = Array.from(
  sourceDocument.matchAll(sourceBlockPattern),
  (match) => ({
    path: match[1],
    language: match[3].toUpperCase(),
    content: match[4].endsWith('\n') ? match[4] : `${match[4]}\n`,
  }),
);

function highlightLine(line: string, query: string): ReactNode {
  const needle = query.trim();
  if (!needle) return line || ' ';

  const loweredLine = line.toLowerCase();
  const loweredNeedle = needle.toLowerCase();
  const segments: ReactNode[] = [];
  let cursor = 0;
  let matchIndex = loweredLine.indexOf(loweredNeedle, cursor);

  while (matchIndex !== -1) {
    if (matchIndex > cursor) {
      segments.push(line.slice(cursor, matchIndex));
    }
    segments.push(
      <mark
        key={`${matchIndex}-${cursor}`}
        className="rounded bg-amber-300 px-0.5 text-slate-950"
      >
        {line.slice(matchIndex, matchIndex + needle.length)}
      </mark>,
    );
    cursor = matchIndex + needle.length;
    matchIndex = loweredLine.indexOf(loweredNeedle, cursor);
  }

  if (cursor < line.length) segments.push(line.slice(cursor));
  return segments.length ? segments : line || ' ';
}

export function SourceBrowser() {
  const [query, setQuery] = useState('');
  const [selectedPath, setSelectedPath] = useState(sourceFiles[0]?.path ?? '');
  const [copyStatus, setCopyStatus] = useState('');
  const normalizedQuery = query.trim().toLowerCase();

  const filteredFiles = useMemo(() => {
    if (!normalizedQuery) return sourceFiles;
    return sourceFiles.filter((file) =>
      file.path.toLowerCase().includes(normalizedQuery) ||
      file.content.toLowerCase().includes(normalizedQuery),
    );
  }, [normalizedQuery]);

  const activeFile =
    filteredFiles.find((file) => file.path === selectedPath) ??
    filteredFiles[0] ??
    null;
  const lines = activeFile
    ? activeFile.content.replace(/\n$/, '').split('\n')
    : [];

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'TradeND Source Library';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  async function copyActiveFile() {
    if (!activeFile) return;
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopyStatus(`${activeFile.path} copied to clipboard`);
    } catch {
      setCopyStatus('Clipboard access is unavailable in this browser');
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white/90">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <a href="/" className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-200">
              <Code2 aria-hidden="true" className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold tracking-tight text-slate-950">TradeND</span>
              <span className="block text-xs text-slate-500">Source library</span>
            </span>
          </a>

          <a
            href="/trade"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <span className="hidden sm:inline">Open trading app</span>
            <span className="sm:hidden">TradeND app</span>
            <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-[1480px] px-4 pb-10 pt-8 sm:px-6 lg:px-8 lg:pt-12">
        <section className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-indigo-700">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />
              Developer reference
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Complete trading update source
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Browse the complete files for live market data, candlestick charts, and market-hours validation. Search across files, inspect line numbers, and copy any file in full.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-medium text-slate-600">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">{sourceFiles.length} files</span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">TypeScript</span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">Feature snapshot</span>
          </div>
        </section>

        <section aria-label="Source code browser" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_48px_-28px_rgba(15,23,42,0.28)]">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Source files</h2>
              <p className="mt-1 text-xs text-slate-500">Full file contents from the saved source artifact</p>
            </div>
            <label className="relative block w-full sm:max-w-sm">
              <span className="sr-only">Search source files and code</span>
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="source-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search filenames or code…"
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
              />
            </label>
          </div>

          <div className="grid min-h-[680px] grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside aria-label="File navigation" className="border-b border-slate-200 bg-slate-50/70 p-3 lg:border-b-0 lg:border-r lg:p-4">
              <div className="mb-3 flex items-center justify-between px-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Files</span>
                <span className="rounded-md bg-white px-2 py-0.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">{filteredFiles.length}</span>
              </div>
              <nav aria-label="Source files">
                {filteredFiles.length > 0 ? (
                  <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
                    {filteredFiles.map((file) => {
                      const selected = activeFile?.path === file.path;
                      const displayPath = file.path.replace(/^Project\//, '');
                      return (
                        <li key={file.path} className="shrink-0 lg:shrink">
                          <button
                            type="button"
                            aria-pressed={selected}
                            onClick={() => {
                              setSelectedPath(file.path);
                              setCopyStatus('');
                            }}
                            className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                              selected
                                ? 'border-indigo-200 bg-indigo-50 text-indigo-900 shadow-sm'
                                : 'border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900'
                            }`}
                          >
                            <FileCode2 aria-hidden="true" className={`h-4 w-4 shrink-0 ${selected ? 'text-indigo-600' : 'text-slate-400 group-hover:text-indigo-500'}`} />
                            <span className="min-w-0">
                              <span className="block max-w-[210px] truncate text-xs font-semibold">{displayPath}</span>
                              <span className={`mt-1 block text-[10px] uppercase tracking-wider ${selected ? 'text-indigo-600' : 'text-slate-400'}`}>{file.language}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-300 px-3 py-5 text-center text-sm text-slate-500">No files match this search.</p>
                )}
              </nav>
            </aside>

            <section aria-label="Selected source file" className="min-w-0">
              {activeFile ? (
                <>
                  <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-xs font-semibold text-slate-800 sm:text-sm">{activeFile.path}</div>
                      <div className="mt-1 text-xs text-slate-500">{lines.length.toLocaleString('en-US')} lines · {activeFile.language}</div>
                    </div>
                    <button
                      type="button"
                      onClick={copyActiveFile}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                    >
                      {copyStatus.startsWith(activeFile.path) ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
                      {copyStatus.startsWith(activeFile.path) ? 'Copied' : 'Copy file'}
                    </button>
                  </div>

                  <div className="max-h-[68vh] min-h-[480px] overflow-auto bg-slate-950 px-3 py-4 sm:px-5">
                    <div className="min-w-max font-mono text-[11px] leading-5 sm:text-xs sm:leading-[1.45rem]">
                      {lines.map((line, index) => (
                        <div key={index} className="grid grid-cols-[3.25rem_minmax(0,1fr)] pr-4">
                          <span aria-hidden="true" className="select-none pr-4 text-right text-slate-500">{index + 1}</span>
                          <span className="whitespace-pre text-slate-200">{highlightLine(line, normalizedQuery)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid min-h-[480px] place-items-center px-6 text-center">
                  <div>
                    <Search aria-hidden="true" className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-3 text-sm font-semibold text-slate-700">No source matches your search</p>
                    <p className="mt-1 text-xs text-slate-500">Try another filename, function, or phrase.</p>
                  </div>
                </div>
              )}
            </section>
          </div>
        </section>

        <p role="status" aria-live="polite" className="mt-3 min-h-5 text-right text-xs text-slate-500">{copyStatus}</p>
        <footer className="mt-8 flex flex-col gap-2 border-t border-slate-200 pt-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>TradeND source reference · complete file snapshots</span>
          <a href="/trade" className="inline-flex items-center gap-1 font-semibold text-indigo-700 hover:text-indigo-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
            Return to trading app <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
          </a>
        </footer>
      </div>
    </main>
  );
}
