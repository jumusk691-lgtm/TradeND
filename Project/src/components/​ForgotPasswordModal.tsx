import { useState } from 'react';
import { Mail, X } from 'lucide-react';
import { ref, get } from 'firebase/database';
import { db } from '@/lib/firebase';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSignIn: () => void;
}

export function ForgotPasswordModal({
  isOpen,
  onClose,
  onOpenSignIn,
}: ForgotPasswordModalProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      const emailKey = cleanEmail.replace(/\./g, ',');
      const userRef = ref(db, `users_details/${emailKey}`);
      const snapshot = await get(userRef);

      if (!snapshot.exists()) {
        setError('This email address is not registered with us.');
        setLoading(false);
        return;
      }

      const userData = snapshot.val();
      setSuccessMsg(`Your password is: ${userData.password}`);
    } catch (err) {
      console.error('Password Recovery Error:', err);
      setError('Failed to fetch account info.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0a0c] p-6 shadow-2xl text-left">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-gray-400 hover:bg-white/10 hover:text-white cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6">
          <h2 className="text-xl font-bold text-white">Reset Password</h2>
          <p className="text-xs text-gray-400 mt-1">
            Enter your registered email address to recover your password.
          </p>
        </div>

        <form onSubmit={handleForgot} className="space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-gray-400 mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
              <input
                type="email"
                required
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/60 pl-9 pr-4 py-2.5 text-sm text-white focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300 font-mono">
              {successMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-900/40 transition-all disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Searching...' : 'Recover Password'}
          </button>

          <div className="text-center pt-2 text-xs">
            <button
              type="button"
              onClick={onOpenSignIn}
              className="text-accent hover:underline cursor-pointer"
            >
              Back to Sign In
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
