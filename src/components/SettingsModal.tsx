"use client";

import { useState, useEffect } from "react";
import { X, Key, Shield, Database, Save, CheckCircle2 } from "lucide-react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function SettingsModal({ isOpen, onClose, onSaved }: SettingsModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setApiKey(localStorage.getItem("api_key") || "");
    }
  }, [isOpen]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    localStorage.setItem("api_key", apiKey);
    
    setTimeout(() => {
      setIsSaving(false);
      setShowSuccess(true);
      onSaved();
      setTimeout(() => {
        setShowSuccess(false);
        onClose();
      }, 1500);
    }, 500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-in fade-in" onClick={onClose} />
      
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 border border-white/10">
        <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Key className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-heading font-bold text-slate-900 dark:text-white">Ayarlar</h2>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">API & Erişim Kontrolü</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-all">
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-10 space-y-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Mevcut Plan</label>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${apiKey ? "bg-primary/20 text-primary" : "bg-slate-100 dark:bg-slate-800 text-slate-400"} uppercase tracking-widest`}>
                {apiKey ? "PRO PLAN" : "ÜCRETSİZ PLAN"}
              </span>
            </div>
            
            <div className="p-6 rounded-3xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>ÖZELLİKLER</span>
                <div className="flex gap-4">
                  <span>FREE</span>
                  <span className="text-primary">PRO</span>
                </div>
              </div>
              <div className="space-y-2">
                {[
                   { n: "Sınırsız Arama", f: true, p: true },
                   { n: "CSV Aktarımı", f: false, p: true },
                   { n: "Hassasiyet Filtresi", f: false, p: true },
                   { n: "Öncelikli Veri", f: false, p: true }
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-1 border-b border-white/5 last:border-0">
                    <span className="text-xs text-slate-600 dark:text-slate-400">{item.n}</span>
                    <div className="flex gap-8">
                      {item.f ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <X className="w-3 h-3 text-slate-300" />}
                      <CheckCircle2 className="w-3 h-3 text-primary" />
                    </div>
                  </div>
                ))}
              </div>
              {!apiKey && (
                <button 
                  type="button"
                  onClick={() => { onClose(); /* Handle upgrade trigger in parent */ }}
                  className="w-full py-3 mt-2 bg-primary/10 text-primary text-xs font-bold rounded-xl hover:bg-primary hover:text-white transition-all"
                >
                  PRO'ya Yükselt
                </button>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Kişisel API Anahtarı</label>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">İsteğe Bağlı</span>
            </div>
            <div className="relative group">
              <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity" />
              <input 
                type="text" 
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk_..."
                className="relative w-full px-6 py-5 bg-slate-50 dark:bg-slate-800/50 border-2 border-transparent focus:border-primary rounded-2xl outline-none transition-all dark:text-white font-mono text-sm shadow-inner"
              />
            </div>
            <p className="text-[10px] text-slate-500 font-body leading-relaxed px-1">
              Veri indirme ve yüksek frekanslı aramalar için kişisel anahtarınızı kullanabilirsiniz. Anahtarınız tarayıcınızda güvenle saklanır.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-5 rounded-3xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
              <Shield className="w-5 h-5 text-emerald-500 mb-3" />
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase mb-1">Erişim Tipi</h4>
              <p className="text-[10px] text-slate-500 font-bold">{apiKey ? "PREMIUM KEY" : "ÜCRETSİZ LİMİT"}</p>
            </div>
            <div className="p-5 rounded-3xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
              <Database className="w-5 h-5 text-primary mb-3" />
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase mb-1">Kota Durumu</h4>
              <p className="text-[10px] text-slate-500 font-bold">{apiKey ? "SINIRSIZ" : "50 ARAMA/GÜN"}</p>
            </div>
          </div>

          <button 
            type="submit"
            disabled={isSaving || showSuccess}
            className={`w-full py-5 rounded-[1.5rem] font-bold text-white transition-all flex items-center justify-center gap-3 shadow-xl ${
              showSuccess ? "bg-emerald-500 shadow-emerald-500/20" : "bg-primary shadow-primary/20 hover:scale-105 active:scale-95"
            }`}
          >
            {showSuccess ? (
              <>
                <CheckCircle2 className="w-6 h-6 animate-in zoom-in" />
                Kaydedildi!
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                {isSaving ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
