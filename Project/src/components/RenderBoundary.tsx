import { Component, type ErrorInfo, type ReactNode } from 'react';

interface RenderBoundaryProps {
  children: ReactNode;
}

interface RenderBoundaryState {
  error: Error | null;
}

export class RenderBoundary extends Component<RenderBoundaryProps, RenderBoundaryState> {
  state: RenderBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RenderBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[v0] Render failure:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-900">
          <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">TRADEND</p>
            <h1 className="mt-3 text-2xl font-bold">The trading workspace could not load</h1>
            <p className="mt-3 text-sm text-slate-500">Refresh the page to retry. If the problem continues, contact support.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500"
            >
              Reload workspace
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
