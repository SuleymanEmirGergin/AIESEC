"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Search, ChevronDown, Check, X } from "lucide-react";
import type { PlaceType } from "@/lib/types";
import { PLACE_TYPE_LABELS, PLACE_TYPE_GROUPS } from "@/lib/types";
import type { PresetsResponse } from "@/lib/configTypes";

interface TypeSelectorProps {
  selectedType: PlaceType;
  onTypeChange: (type: PlaceType) => void;
  presets: PresetsResponse;
}

export default function TypeSelector({
  selectedType,
  onTypeChange,
  presets,
}: TypeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Normalize groups to Record<string, string[]> for internal use
  const normalizedGroups = useMemo((): Record<string, string[]> => {
    const rawGroups = presets.type_groups_tr || PLACE_TYPE_GROUPS;
    
    if (Array.isArray(rawGroups)) {
      const record: Record<string, string[]> = {};
      rawGroups.forEach((item) => {
        if (typeof item === 'object' && 'group' in item && 'types' in item) {
          record[item.group] = item.types;
        }
      });
      return record;
    }
    
    return rawGroups as Record<string, string[]>;
  }, [presets.type_groups_tr]);

  const labels = presets.type_labels_tr || PLACE_TYPE_LABELS;
  const currentLabel = labels[selectedType] || selectedType;

  // Filter types based on search
  const filteredGroups = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return normalizedGroups;

    const result: Record<string, string[]> = {};
    Object.entries(normalizedGroups).forEach(([groupName, types]) => {
      if (!Array.isArray(types)) return;
      
      const matchingTypes = types.filter((t) =>
        (labels[t as PlaceType] || t).toLowerCase().includes(q)
      );
      if (matchingTypes.length > 0) {
        result[groupName] = matchingTypes;
      }
    });
    return result;
  }, [searchQuery, normalizedGroups, labels]);

  // Click away to close
  useEffect(() => {
    const handleClickAway = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickAway);
      // Auto-focus search input
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    return () => document.removeEventListener("mousedown", handleClickAway);
  }, [isOpen]);

  const handleSelect = (type: string) => {
    onTypeChange(type as PlaceType);
    setIsOpen(false);
    setSearchQuery("");
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <label className="block text-sm font-heading font-semibold text-slate-700 dark:text-slate-300 mb-2">
        Yer Tipi
      </label>

      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border-2 transition-all text-left ${
          isOpen 
            ? "border-primary bg-white dark:bg-slate-800 shadow-md ring-2 ring-primary/10" 
            : "border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600"
        }`}
      >
        <span className="text-sm font-body font-semibold text-slate-900 dark:text-white">
          {currentLabel}
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Popover */}
      {isOpen && (
        <div className="absolute top-[calc(100%+8px)] left-0 right-0 z-[100] bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in slide-in-from-top-2">
          {/* Search Input */}
          <div className="p-3 border-b border-slate-100 dark:border-slate-700 relative">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ara..."
              className="w-full pl-9 pr-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all dark:text-white"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery("")}
                className="absolute right-6 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full"
              >
                <X className="w-3 h-3 text-slate-500" />
              </button>
            )}
          </div>

          {/* Items List */}
          <div className="max-h-72 overflow-y-auto px-1 py-1 custom-scrollbar">
            {Object.entries(filteredGroups).length > 0 ? (
              Object.entries(filteredGroups).map(([groupName, types]) => (
                <div key={groupName} className="mb-2 last:mb-0">
                  <div className="px-3 py-2 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest bg-slate-50/50 dark:bg-slate-800/50 rounded-md">
                    {groupName}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {types.map((type) => (
                      <button
                        key={type}
                        onClick={() => handleSelect(type)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-body transition-colors ${
                          selectedType === type
                            ? "bg-primary/10 text-primary font-bold"
                            : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                        }`}
                      >
                        <span>{labels[type as PlaceType] || type}</span>
                        {selectedType === type && <Check className="w-4 h-4" />}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center">
                <Search className="w-8 h-8 text-slate-200 dark:text-slate-700 mx-auto mb-2" />
                <p className="text-xs text-slate-500 font-body">Sonuç bulunamadı</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
