"use client";

import { X, Check, Zap, Crown, Download, ShieldCheck, Map, Search, Database } from "lucide-react";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UpgradeModal({ isOpen, onClose }: UpgradeModalProps) {
  if (!isOpen) return null;

  const features = [
    { name: "Sınırsız Arama", free: true, pro: true },
    { name: "Yüksek Hassasiyetli Filtreler", free: false, pro: true },
    { name: "Lead Export (CSV/PDF)", free: false, pro: true },
    { name: "Admin Paneli Erişimi", free: false, pro: true },
    { name: "Öncelikli Destek", free: false, pro: true },
    { name: "Özel Veri Overrides", free: false, pro: true },
  ];

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-xl animate-in fade-in" onClick={onClose} />
      
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 border border-white/10 flex flex-col lg:flex-row h-[600px] lg:h-auto">
        {/* Left Aspect - Pro Teaser */}
        <div className="lg:w-2/5 bg-primary p-10 text-white flex flex-col justify-between relative overflow-hidden shrink-0">
          <div className="absolute -top-12 -left-12 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-white/5 rounded-full blur-2xl" />
          
          <div className="relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mb-6">
              <Crown className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-3xl font-heading font-black leading-tight mb-4">Pro ile sınırları kaldırın.</h2>
            <p className="text-sm font-body text-white/80 leading-relaxed">
              İş akışınızı hızlandırın ve en kaliteli verilere anında ulaşın.
            </p>
          </div>

          <div className="relative z-10 space-y-4">
            <div className="p-4 bg-white/10 rounded-2xl border border-white/10 backdrop-blur-md">
              <div className="flex items-center gap-3 mb-1">
                <Zap className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold uppercase tracking-widest text-white/60">Popüler</span>
              </div>
              <p className="text-sm font-bold">Aylık $29.99</p>
            </div>
          </div>
        </div>

        {/* Right Aspect - Details */}
        <div className="flex-1 p-10 lg:p-14 flex flex-col">
          <div className="flex justify-between items-start mb-10">
            <div>
              <h3 className="text-2xl font-heading font-bold text-slate-900 dark:text-white mb-1">Plan Karşılaştırması</h3>
              <p className="text-xs font-bold text-primary uppercase tracking-[0.2em]">Sizin İçin En İyisini Seçin</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          <div className="flex-1 space-y-4 mb-10">
            {features.map((f, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 dark:border-slate-800/50">
                <span className="text-sm font-bold text-slate-600 dark:text-slate-400">{f.name}</span>
                <div className="flex items-center gap-6">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[8px] font-bold text-slate-400 uppercase">FREE</span>
                    {f.free ? <Check className="w-4 h-4 text-emerald-500" /> : <X className="w-4 h-4 text-rose-300" />}
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[8px] font-bold text-primary uppercase">PRO</span>
                    <Check className="w-4 h-4 text-primary" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-4">
            <button className="w-full py-5 bg-primary text-white font-black rounded-[1.5rem] shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all text-sm uppercase tracking-widest">
              Hemen Yükselt
            </button>
            <p className="text-[10px] text-center text-slate-400 font-bold uppercase tracking-tighter">
              İstediğiniz zaman iptal edebilirsiniz.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
