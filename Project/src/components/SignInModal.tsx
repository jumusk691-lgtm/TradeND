
import { useState } from 'react';
import { Mail, Lock, X } from 'lucide-react';
import { ref, get } from 'firebase/database';
import { db } from '@/lib/firebase'; // Ensure your firebase export path is correct

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenRegister: () => void;
  onOpenForgot: () => void;
  onSuccess: () => void;
}

export function SignInModal({
  isOpen,
  onClose,
  onOpenRegister,
  onOpenForgot,
  onSuccess,
}: SignInModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!cleanPass) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      const emailKey = cleanEmail.replace(/\./g, ',');
      const userRef = ref(db, `users_details/${emailKey}`);
      const snapshot = await get(userRef);

      if (!snapshot.exists()) {
        setError('Account not found! Please check your email or Register.');
        setLoading(false);
        return;
      }

      const userData = snapshot.val();
      if (userData.password && String(userData.password) !== cleanPass) {
        setError('Incorrect password. Please try again.');
        setLoading(false);
        return;
      }

      // Save user session isolation token
      localStorage.setItem('tradend:uid', emailKey);
      localStorage.setItem('tradend:email', cleanEmail);
      if (userData.name) localStorage.setItem('tradend:name', userData.name);

      onSuccess();
    } catch (err) {
      console.error('Sign In Error:', err);
      setError('Connection error. Please try again.');
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
          <h2 className="text-xl font-bold text-white">Sign In to Trade</h2>
          <p className="text-xs text-gray-400 mt-1">
            Enter your registered email & password to access dashboard.
          </p>
        </div>

        <form onSubmit={handleSignIn} className="space-y-4">
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

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-gray-400 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/60 pl-9 pr-4 py-2.5 font-mono text-sm text-white focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-900/40 transition-all disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Verifying...' : 'Sign In'}
          </button>

          <div className="flex items-center justify-between pt-2 text-xs">
            <button
              type="button"
              onClick={onOpenForgot}
              className="text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              Forgot Password?
            </button>
            <button
              type="button"
              onClick={onOpenRegister}
              className="text-gold font-semibold hover:underline cursor-pointer"
            >
              Create Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
