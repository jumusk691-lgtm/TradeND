import { X, LifeBuoy, Mail, MessageCircle, Phone, Download, ShieldCheck } from 'lucide-react';
import { APK_URL } from '@/types';

interface SupportModalProps {
  open: boolean;
  onClose: () => void;
}

export function SupportModal({ open, onClose }: SupportModalProps) {
  if (!open) return null;

  const channels = [
    { icon: Mail, label: 'Email', value: 'support@zerobrokerageapp.in', href: 'mailto:support@zerobrokerageapp.in' },
    { icon: MessageCircle, label: 'WhatsApp', value: '+91 90000 00000', href: '#' },
    { icon: Phone, label: 'Toll-Free', value: '1800-200-TRAD', href: '#' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md glass rounded-2xl p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-gray-400 hover:bg-white/5 hover:text-white"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <LifeBuoy className="h-6 w-6" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-white">Support Center</h2>
            <p className="text-xs text-gray-500">We're here to help, 24/7</p>
          </div>
        </div>

        <div className="space-y-2.5">
          {channels.map((c) => {
            const Icon = c.icon;
            return (
              <a
                key={c.label}
                href={c.href}
                className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/40 px-4 py-3 hover:border-accent/30 transition-colors"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-accent">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs text-gray-500">{c.label}</div>
                  <div className="text-sm font-medium text-white">{c.value}</div>
                </div>
              </a>
            );
          })}
        </div>

        <a
          href={APK_URL}
          download="TRADEND.apk"
          className="mt-4 flex w-full items-center justify-center gap-2.5 rounded-xl bg-gold/15 border border-gold/40 px-4 py-4 text-base font-bold text-gold hover:bg-gold/25 transition-colors"
        >
          <Download className="h-5 w-5" />
          Download TRADEND App (APK)
        </a>

        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-gray-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          All support channels are encrypted &amp; verified.
        </div>
      </div>
    </div>
  );
}
