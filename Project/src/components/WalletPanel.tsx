import { useState } from 'react';
import {
  Wallet as WalletIcon,
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  Minus,
} from 'lucide-react';
import { fmtINR, timeAgo, uid } from '@/lib/format';
import type { WalletTx } from '@/types';

interface WalletPanelProps {
  balance: number;
  transactions: WalletTx[];
  onDeposit: (amount: number, method: string) => void;
  onWithdraw: (amount: number, method: string) => void;
}

type Tab = 'deposit' | 'withdraw';
const METHODS = ['UPI', 'IMPS', 'NEFT', 'Bank Transfer'];

export function WalletPanel({ balance, transactions, onDeposit, onWithdraw }: WalletPanelProps) {
  const [tab, setTab] = useState<Tab>('deposit');
  const [amount, setAmount] = useState<string>('');
  const [method, setMethod] = useState<string>('UPI');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const amtNum = parseFloat(amount) || 0;

  function handleSubmit() {
    setError(null);
    setSuccess(null);
    if (amtNum <= 0) {
      setError('Enter a valid amount greater than ₹0.');
      return;
    }
    if (tab === 'withdraw' && amtNum > balance) {
      setError(`Insufficient balance. Available: ${fmtINR(balance)}.`);
      return;
    }
    if (tab === 'deposit') {
      onDeposit(amtNum, method);
      setSuccess(`Deposit request of ${fmtINR(amtNum)} via ${method} submitted.`);
    } else {
      onWithdraw(amtNum, method);
      setSuccess(`Withdrawal request of ${fmtINR(amtNum)} via ${method} submitted.`);
    }
    setAmount('');
    setTimeout(() => setSuccess(null), 4000);
  }

  const sortedTx = [...transactions].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
          <WalletIcon className="h-5 w-5 text-accent" />
          Wallet
        </h3>
      </div>

      {/* Balance card */}
      <div className="relative mb-5 overflow-hidden rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/15 via-black/40 to-gold/10 p-5">
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-accent/20 blur-2xl" />
        <div className="relative">
          <div className="text-xs uppercase tracking-wider text-gray-400">Available Balance</div>
          <div className="mt-1 font-display text-3xl font-extrabold text-white">
            {fmtINR(balance)}
          </div>
          <div className="mt-1 text-[11px] text-gray-500">Updated just now · INR</div>
        </div>
      </div>

      {/* Tab toggle */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => {
            setTab('deposit');
            setError(null);
            setSuccess(null);
          }}
          className={`flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all ${
            tab === 'deposit'
              ? 'bg-accent text-white btn-glow'
              : 'bg-black/40 text-gray-400 hover:text-white border border-white/5'
          }`}
        >
          <ArrowDownToLine className="h-4 w-4" />
          Deposit
        </button>
        <button
          onClick={() => {
            setTab('withdraw');
            setError(null);
            setSuccess(null);
          }}
          className={`flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all ${
            tab === 'withdraw'
              ? 'bg-gold text-black gold-glow'
              : 'bg-black/40 text-gray-400 hover:text-white border border-white/5'
          }`}
        >
          <ArrowUpFromLine className="h-4 w-4" />
          Withdraw
        </button>
      </div>

      {/* Form */}
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wider text-gray-500">
            Amount (₹)
          </label>
          <input
            type="number"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-lg border border-white/5 bg-black/40 px-3 py-2.5 font-mono text-base text-white placeholder:text-gray-600 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[1000, 5000, 10000, 50000].map((q) => (
              <button
                key={q}
                onClick={() => setAmount(String(q))}
                className="rounded-md border border-white/5 bg-black/40 px-2.5 py-1 text-xs text-gray-400 hover:border-accent/40 hover:text-white transition-colors"
              >
                ₹{q.toLocaleString('en-IN')}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wider text-gray-500">
            Method
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {METHODS.map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`rounded-lg py-2 text-[11px] font-semibold transition-colors ${
                  method === m
                    ? 'bg-accent text-white'
                    : 'bg-black/40 text-gray-400 hover:text-white border border-white/5'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            {success}
          </div>
        )}

        <button
          onClick={handleSubmit}
          className={`w-full rounded-xl py-3.5 text-sm font-bold transition-all ${
            tab === 'deposit'
              ? 'bg-accent text-white hover:bg-accent/90 btn-glow'
              : 'bg-gold text-black hover:bg-gold/90 gold-glow'
          }`}
        >
          {tab === 'deposit' ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Plus className="h-4 w-4" /> Submit Deposit Request
            </span>
          ) : (
            <span className="inline-flex items-center justify-center gap-2">
              <Minus className="h-4 w-4" /> Submit Withdrawal Request
            </span>
          )}
        </button>
      </div>

      {/* Transaction history */}
      <div className="mt-6">
        <h4 className="mb-2 text-xs uppercase tracking-wider text-gray-500">
          Recent Transactions
        </h4>
        {sortedTx.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center text-sm text-gray-600">
            No transactions yet.
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
            {sortedTx.slice(0, 20).map((tx) => (
              <TxRow key={tx.id} tx={tx} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TxRow({ tx }: { tx: WalletTx }) {
  const isDeposit = tx.type === 'DEPOSIT';
  const statusIcon =
    tx.status === 'COMPLETED' ? (
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
    ) : tx.status === 'REJECTED' ? (
      <XCircle className="h-3.5 w-3.5 text-rose-400" />
    ) : (
      <Clock className="h-3.5 w-3.5 text-gold" />
    );

  return (
    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-black/30 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${
            isDeposit ? 'bg-emerald-500/10 text-emerald-400' : 'bg-gold/10 text-gold'
          }`}
        >
          {isDeposit ? (
            <ArrowDownToLine className="h-4 w-4" />
          ) : (
            <ArrowUpFromLine className="h-4 w-4" />
          )}
        </div>
        <div>
          <div className="text-sm font-medium text-white">
            {isDeposit ? 'Deposit' : 'Withdrawal'} · {tx.method}
          </div>
          <div className="text-[11px] text-gray-500">
            {tx.date} · {tx.status}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`font-mono text-sm font-semibold ${
            isDeposit ? 'text-emerald-400' : 'text-gold'
          }`}
        >
          {isDeposit ? '+' : '-'}
          {fmtINR(tx.amount)}
        </span>
        {statusIcon}
      </div>
    </div>
  );
}

// Helper to build a new transaction (used by App)
export function makeTx(
  type: 'DEPOSIT' | 'WITHDRAW',
  amount: number,
  method: string,
  status: WalletTx['status'] = 'PENDING'
): WalletTx {
  return {
    id: uid('tx'),
    type,
    amount,
    status,
    method,
    date: new Date().toISOString(),
  };
}
