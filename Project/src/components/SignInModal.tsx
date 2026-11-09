import { useState } from 'react';
import { Mail, Lock, X } from 'lucide-react';
import { ref, get, query, orderByChild, equalTo } from 'firebase/database';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '@/lib/firebase'; // Ensure your firebase auth & db are exported correctly

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
  const [identifier, setIdentifier] = useState(''); // Can be Email or Mobile
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanInput = identifier.trim();
    const cleanPass = password.trim();

    if (!cleanInput) {
      setError('Please enter your email or mobile number.');
      return;
    }
    if (!cleanPass) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);

    try {
      let targetEmail = cleanInput;

      // 🔍 EXACT ANDROID LOGIC: If input is NOT an email, treat it as mobile and find email from RTDB
      if (!cleanInput.includes('@')) {
        const usersRef = ref(db, 'users_details');
        const mobileQuery = query(usersRef, orderByChild('mobile'), equalTo(cleanInput));
        const snapshot = await get(mobileQuery);

        if (!snapshot.exists()) {
          setError('No account found with this mobile number.');
          setLoading(false);
          return;
        }

        // Extract email associated with this mobile number
        let foundEmail = '';
        snapshot.forEach((childSnapshot) => {
          const userData = childSnapshot.val();
          if (userData && userData.email) {
            foundEmail = userData.email;
          }
        });

        if (!foundEmail) {
          setError('Associated email not found for this mobile number.');
          setLoading(false);
          return;
        }
        targetEmail = foundEmail;
      }

      // 🔐 FIREBASE AUTH SIGN IN (Same as Android performFirebaseLogin)
      const userCredential = await signInWithEmailAndPassword(auth, targetEmail, cleanPass);
      const user = userCredential.user;

      if (user) {
        const emailKey = targetEmail.toLowerCase().replace(/\./g, ',');
        
        // Save session tokens securely in localStorage (matching web state)
        localStorage.setItem('tradend:uid', emailKey);
        localStorage.setItem('tradend:email', targetEmail);
        localStorage.setItem('tradend:auth_uid', user.uid);

        // Reset form & trigger dashboard entry
        setIdentifier('');
        setPassword('');
        setError(null);
        onSuccess();
      }
    } catch (err: any) {
      console.error('Sign In Error:', err);
      setError(err.message || 'Invalid credentials or connection failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0a0c] p-6 shadow-2xl text-left">
        <button
          type="button"
          onClick={() => {
            setError(null);
            onClose();
          }}
          className="absolute right-4 top-4 rounded-lg p-1 text-gray-400 hover:bg-white/10 hover:text-white cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6">
          <h2 className="text-xl font-bold text-white">Sign In to Trade</h2>
          <p className="text-xs text-gray-400 mt-1">
            Enter your email or mobile number &amp; password to access dashboard.
          </p>
        </div>

        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-gray-400 mb-1">
              Email or Mobile Number
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
              <input
                type="text"
                required
                placeholder="name@example.com or 10-digit mobile"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
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
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400 font-medium">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-900/40 transition-all disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>

          <div className="flex items-center justify-between pt-2 text-xs">
            <button
              type="button"
              onClick={() => {
                setError(null);
                onOpenForgot();
              }}
              className="text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              Forgot Password?
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                onOpenRegister();
              }}
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

export default SignInModal;
