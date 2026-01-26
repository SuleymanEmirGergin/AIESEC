"use client";

import React from "react";
import { 
  Factory, 
  School, 
  Baby, 
  GraduationCap, 
  Briefcase 
} from "lucide-react";
import type { PlaceType } from "../lib/types";

interface FiltersProps {
  selectedCategory: PlaceType | null;
  onCategoryChange: (category: PlaceType | null) => void;
}

const CATEGORIES: { id: PlaceType; label: string; icon: any }[] = [
  { id: "factory", label: "Fabrika", icon: Factory },
  { id: "kindergarten", label: "Anaokulu", icon: Baby },
  { id: "middle_school", label: "Ortaokul", icon: School },
  { id: "high_school", label: "Lise", icon: GraduationCap },
  { id: "college_university", label: "Üniversite", icon: Briefcase },
];

export default function Filters({ selectedCategory, onCategoryChange }: FiltersProps) {
  return (
    <div className="flex flex-wrap gap-2 p-4 bg-white/50 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-10">
      {CATEGORIES.map((cat) => {
        const Icon = cat.icon;
        const isActive = selectedCategory === cat.id;
        
        return (
          <button
            key={cat.id}
            onClick={() => onCategoryChange(isActive ? null : cat.id)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all
              ${isActive 
                ? "bg-slate-900 text-white shadow-lg shadow-slate-200 scale-105" 
                : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"}
            `}
          >
            <Icon size={16} />
            {cat.label}
          </button>
        );
      })}
    </div>
  );
}
