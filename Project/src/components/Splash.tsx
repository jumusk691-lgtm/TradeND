import { useEffect, useState } from 'react';
import { ShieldCheck, Download, ArrowRight, Lock, Zap, TrendingUp } from 'lucide-react';
import { APK_URL } from '@/types';

// Import distinct modals from separate files with exact casing
import { SignInModal } from '@/components/SignInModal';
import { RegisterModal } from '@/components/RegisterModal';
import { ForgotPasswordModal } from '@/components/ForgotPasswordModal';

interface SplashProps {
  onEnter: () => void;
}

export function Splash({ onEnter }: SplashProps) {
  const [mounted, setMounted] = useState(false);
  
  // Modal Navigation State: 'none' | 'signin' | 'register' | 'forgot'
  const [activeModal, setActiveModal] = useState<'none' | 'signin' | 'register' | 'forgot'>('none');

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 40);
    return () => clearTimeout(t);
  }, []);

  const closeModal = () => setActiveModal('none');

  return (
    <section
      id="splash"
      className="relative min-h-screen w-full overflow-hidden bg-ink text-white flex items-center justify-center px-4"
    >
      {/* Animated grid background */}
      <div className="absolute inset-0 grid-bg animate-grid-pan opacity-60" />
      
      {/* Radial glows */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-[34rem] w-[34rem] rounded-full bg-accent/20 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-[34rem] w-[34rem] rounded-full bg-gold/15 blur-[120px]" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[24rem] w-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-[100px]" />

      {/* Top trust bar */}
      <div
        className={`absolute top-0 inset-x-0 z-10 transition-all duration-700 ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
        }`}
      >
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-accent" />
            256-bit Encrypted
          </span>
          <span className="hidden sm:flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-gold" />
            Zero Brokerage
          </span>
          <span className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-accent" />
            NSE · BSE · MCX
          </span>
        </div>
      </div>

      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-2xl">
        {/* Logo mark */}
        <div
          className={`relative mb-8 transition-all duration-700 ${
            mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
          }`}
        >
          <div className="absolute inset-0 rounded-2xl bg-accent/30 blur-2xl animate-pulse-ring" />
          <div className="relative h-20 w-20 rounded-2xl border border-accent/40 bg-gradient-to-br from-accent/20 to-gold/10 flex items-center justify-center">
            <svg viewBox="0 0 64 64" className="h-11 w-11" fill="none">
              <path
                d="M12 42 L22 30 L30 38 L44 18 L52 18 L34 46 L26 38 L18 46 Z"
                fill="#0066FF"
              />
              <rect x="18" y="50" width="28" height="3" rx="1.5" fill="#DAA520" />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h1
          className={`font-display text-6xl sm:text-7xl font-extrabold tracking-tight transition-all duration-700 delay-100 ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          <span className="gold-text">TRA</span>
          <span className="accent-text">DEND</span>
        </h1>

        <p
          className={`mt-3 text-sm sm:text-base text-gray-400 tracking-[0.2em] uppercase transition-all duration-700 delay-200 ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          Zero Brokerage · Ultra-Secure Trading
        </p>

        {/* Security badge */}
        <div
          className={`mt-8 transition-all duration-700 delay-300 ${
            mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}
        >
          <div className="inline-flex items-center gap-2.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-5 py-2.5 backdrop-blur">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <span className="text-sm font-medium text-emerald-300">
              <span className="text-emerald-400">✓</span> Safe &amp; Verified
            </span>
            <span className="text-gray-600">•</span>
            <span className="text-sm text-gray-300">Your Funds &amp; Data are Secure</span>
          </div>
        </div>

        {/* Action buttons */}
        <div
          className={`mt-10 flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto transition-all duration-700 delay-500 ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <button
            onClick={() => setActiveModal('signin')}
            className="group relative inline-flex items-center justify-center gap-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-emerald-900/35 transition-transform hover:scale-[1.03] active:scale-95 w-full sm:w-auto cursor-pointer"
          >
            Trade Now
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </button>

          <a
            href={APK_URL}
            download="TRADEND.apk"
            className="group relative inline-flex items-center justify-center gap-3 rounded-xl border border-gold/50 bg-gold/10 px-8 py-4 text-lg font-bold text-gold gold-glow transition-transform hover:scale-[1.03] active:scale-95 w-full sm:w-auto"
          >
            <Download className="h-5 w-5" />
            Download App (APK)
          </a>
        </div>

        {/* Quick stats */}
        <div
          className={`mt-14 grid grid-cols-3 gap-6 sm:gap-12 transition-all duration-700 delay-700 ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          {[
            { label: 'Daily Volume', value: '₹4,200Cr+' },
            { label: 'Active Traders', value: '1.2L+' },
            { label: 'Uptime', value: '99.98%' },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className="font-display text-xl sm:text-2xl font-bold text-white">
                {s.value}
              </div>
              <div className="mt-1 text-[11px] sm:text-xs text-gray-500 uppercase tracking-wider">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modals */}
      <SignInModal
        isOpen={activeModal === 'signin'}
        onClose={closeModal}
        onOpenRegister={() => setActiveModal('register')}
        onOpenForgot={() => setActiveModal('forgot')}
        onSuccess={onEnter}
      />

      <RegisterModal
        isOpen={activeModal === 'register'}
        onClose={closeModal}
        onOpenSignIn={() => setActiveModal('signin')}
        onSuccess={onEnter}
      />

      <ForgotPasswordModal
        isOpen={activeModal === 'forgot'}
        onClose={closeModal}
        onOpenSignIn={() => setActiveModal('signin')}
      />
    </section>
  );
}

export default Splash;
