import { useState } from 'react';
import { User, Mail, Lock, Phone, X } from 'lucide-react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { ref, set } from 'firebase/database';
import { auth, db } from '@/lib/firebase';

interface RegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSignIn: () => void;
  onSuccess: () => void;
}

function generateReferralCode(phone: string): string {
  const digitsOnly = phone.replace(/\D/g, '');
  if (digitsOnly.length >= 6) {
    const startIndex = Math.floor((digitsOnly.length - 4) / 2);
    const midFour = digitsOnly.slice(startIndex, startIndex + 4);
    return `TRADEnd${midFour}`;
  }
  const fallback = digitsOnly.padEnd(4, '0').slice(0, 4);
  return `TRADEnd${fallback}`;
}

export function RegisterModal({
  isOpen,
  onClose,
  onOpenSignIn,
  onSuccess,
}: RegisterModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = name.trim();
    const cleanPhone = phone.replace(/\D/g, '');
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanName) {
      setError('Please enter your full name.');
      return;
    }
    if (cleanPhone.length !== 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!cleanPass || cleanPass.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPass);
      const uid = credential.user.uid;
      const referralCode = generateReferralCode(cleanPhone);

      const userRef = ref(db, `users_details/${uid}`);
      const newUser = {
        name: cleanName,
        phone: cleanPhone,
        email: cleanEmail,
        referral_code: referralCode,
        referred_by_code: '',
        deposit_done: false,
        funds: { balance: 0 },
        createdAt: new Date().toISOString(),
      };

      await set(userRef, newUser);

      localStorage.setItem('tradend:uid', uid);
      localStorage.setItem('tradend:email', cleanEmail);
      localStorage.setItem('tradend:name', cleanName);
      localStorage.setItem('tradend:phone', cleanPhone);
      localStorage.setItem('tradend:referral_code', referralCode);

      onSuccess();
    } catch (err: any) {
      console.error('Registration Error:', err);
      if (err?.code === 'auth/email-already-in-use') {
        setError('An account already exists with this email. Please sign in.');
      } else if (err?.code === 'auth/weak-password') {
        setError('Password must be at least 6 characters long.');
      } else {
        setError('Failed to create account. Please try again.');
      }
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
          <h2 className="text-xl font-bold text-white">Create New Account</h2>
          <p className="text-xs text-gray-400 mt-1">
            Fill in your details to create your secure private trading profile.
          </p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-gray-400 mb-1">
              Full Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
              <input
                type="text"
                required
                placeholder="Your Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/60 pl-9 pr-4 py-2.5 text-sm text-white focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-gray-400 mb-1">
              Mobile Number
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                required
                placeholder="10-digit Mobile Number"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="w-full rounded-xl border border-white/10 bg-black/60 pl-9 pr-4 py-2.5 font-mono text-sm text-white focus:border-accent focus:outline-none"
              />
            </div>
          </div>

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
            {loading ? 'Registering...' : 'Register Account'}
          </button>

          <div className="text-center pt-2 text-xs">
            <button
              type="button"
              onClick={onOpenSignIn}
              className="text-accent hover:underline cursor-pointer"
            >
              Already registered? Back to Sign In
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
