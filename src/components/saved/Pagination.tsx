"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  pages: number;
  total: number;
  size: number;
  onPage: (page: number) => void;
}

export default function Pagination({ page, pages, total, size, onPage }: PaginationProps) {
  if (total === 0) return null;
  const from = (page - 1) * size + 1;
  const to = Math.min(page * size, total);
  return (
    <nav aria-label="Sayfalar" className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="mono-label tabular">
        {from}–{to} / {total}
      </span>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            className="btn btn--ghost px-2.5 py-1.5 text-xs disabled:opacity-40"
          >
            <ChevronLeft size={14} aria-hidden="true" />
            Önceki
          </button>
          <span className="tabular px-2 text-xs text-ink-3">
            {page} / {pages}
          </span>
          <button
            type="button"
            onClick={() => onPage(page + 1)}
            disabled={page >= pages}
            className="btn btn--ghost px-2.5 py-1.5 text-xs disabled:opacity-40"
          >
            Sonraki
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </div>
      )}
    </nav>
  );
}
