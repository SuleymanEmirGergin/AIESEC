"use client";

import { useState } from "react";
import { adminApi } from "@/lib/adminApi";
import type { AdminReport, ReportStatus } from "@/lib/types";
import { PLACE_TYPE_LABELS } from "@/lib/types";
import { X, ExternalLink, MapPin, CheckCircle, Slash, MessageSquare, Tag, Plus, PlusCircle } from "lucide-react";

interface AdminReportDetailProps {
  report: AdminReport;
  onClose: () => void;
  onUpdate: () => void;
  onCreateOverride?: (placeId: string, correctedType: any) => void;
}

export default function AdminReportDetail({ report, onClose, onUpdate, onCreateOverride }: AdminReportDetailProps) {
  const [status, setStatus] = useState<ReportStatus>(report.status);
  const [adminNotes, setAdminNotes] = useState(report.admin_notes || "");
  const [tags, setTags] = useState(report.tags || []);
  const [newTag, setNewTag] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await adminApi.updateReport(report.id, {
        status,
        admin_notes: adminNotes,
        tags,
      });
      onUpdate();
      onClose();
    } catch (error) {
      alert("Hata: " + (error instanceof Error ? error.message : "Rapor güncellenemedi"));
    } finally {
      setIsSaving(false);
    }
  };

  const addTag = () => {
    if (newTag && !tags.includes(newTag)) {
      setTags([...tags, newTag]);
      setNewTag("");
    }
  };

  const openInOSM = () => {
    window.open(`https://www.openstreetmap.org/?mlat=${report.coordinates.lat}&mlon=${report.coordinates.lng}#map=18/${report.coordinates.lat}/${report.coordinates.lng}`, "_blank");
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in" onClick={onClose} />
      
      <div className="relative w-full max-w-xl h-full bg-white dark:bg-slate-900 shadow-2xl animate-in slide-in-from-right flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-heading font-bold text-slate-900 dark:text-white">Rapor Detayı</h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{report.id}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
          {/* Info Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-heading font-bold dark:text-white">{report.placeName}</h3>
                <button 
                  onClick={openInOSM}
                  className="text-xs text-primary hover:underline flex items-center gap-1 font-bold"
                >
                  OSM'de Görüntüle <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <p className="text-[10px] text-slate-500 font-bold mb-1 uppercase">Sistemdeki Tip</p>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{PLACE_TYPE_LABELS[report.currentType]}</p>
              </div>
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                <p className="text-[10px] text-primary font-bold mb-1 uppercase">Önerilen Tip</p>
                <p className="text-sm font-bold text-primary">{PLACE_TYPE_LABELS[report.correctedType]}</p>
              </div>
            </div>

            {report.notes && (
              <div className="p-4 rounded-xl border-2 border-slate-100 dark:border-slate-800 italic text-sm text-slate-600 dark:text-slate-400 font-body">
                "{report.notes}"
              </div>
            )}
          </section>

          {/* Action Section */}
          <section className="space-y-6 pt-6 border-t border-slate-100 dark:border-slate-800">
            <div>
              <label className="block text-sm font-heading font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-slate-400" /> Durum
              </label>
              <div className="flex gap-2">
                {(["open", "resolved", "ignored"] as ReportStatus[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all border-2 ${
                      status === s 
                        ? "bg-primary border-primary text-white shadow-lg" 
                        : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {s === "open" ? "Açık" : s === "resolved" ? "Çözüldü" : "Yoksay"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-heading font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-slate-400" /> Admin Notları
              </label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Bu rapor hakkında not bırakın..."
                className="w-full h-32 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl text-sm font-body outline-none focus:ring-2 focus:ring-primary/20 transition-all dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-heading font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <Tag className="w-4 h-4 text-slate-400" /> Etiketler
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                {tags.map((tag) => (
                  <span key={tag} className="flex items-center gap-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600">
                    {tag}
                    <button onClick={() => setTags(tags.filter(t => t !== tag))} className="hover:text-rose-500">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && addTag()}
                  placeholder="Yeni etiket..."
                  className="flex-1 bg-slate-50 dark:bg-slate-800 px-4 py-2 rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary/30"
                />
                <button onClick={addTag} className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {onCreateOverride && (
              <button 
                onClick={() => onCreateOverride(report.placeId, report.correctedType)}
                className="w-full flex items-center justify-center gap-2 py-4 px-6 rounded-xl bg-primary/10 text-primary font-bold text-sm hover:bg-primary hover:text-white transition-all border-2 border-primary/20 border-dashed"
              >
                <PlusCircle className="w-5 h-5" />
                Bu Rapor İçin Override Oluştur
              </button>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800"
          >
            Vazgeç
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-[2] py-3 rounded-xl bg-primary text-white text-sm font-bold shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
          >
            {isSaving ? "Kaydediliyor..." : "Raporu Güncelle"}
          </button>
        </div>
      </div>
    </div>
  );
}
